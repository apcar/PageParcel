/**
 * PageParcel background service worker.
 *
 * Coordinates capture requests from the popup (and keyboard commands) and runs
 * them against the active tab using `activeTab` + `scripting` — no broad host
 * permissions. In-page work (measurement, scrolling, canvas compositing) is done
 * by injecting self-contained functions via `chrome.scripting.executeScript`;
 * the service worker itself only orchestrates and captures viewport tiles with
 * `chrome.tabs.captureVisibleTab`.
 *
 * After a capture completes, the image is stashed in storage and the editor page
 * is opened in a new tab. Export (download) happens from the editor.
 */
import type {
  BackgroundMessage,
  CaptureMode,
  CapturePackDraft,
  PopupMessage,
  TileSpec,
} from '../shared/types';
import { setCapturePackDraft, setLastCapture } from '../shared/storage';
import { isProtectedUrl } from '../shared/utils';
import { computeScrollPositions, MAX_CANVAS_HEIGHT_PX } from '../shared/geometry';
import { computeImageSegments, MAX_BUNDLE_HEIGHT_PX } from '../shared/pack';
import {
  cropTile,
  getMetrics,
  hideFixedElements,
  prepareCapture,
  restoreCapture,
  scrollToPosition,
  stitchTiles,
} from '../content/scroll-capture';
import { collectOcrImages } from '../content/ocr-regions';
import { selectRegion } from '../content/region-select';
import { collectPageSnapshot, stitchTileSegment } from '../content/page-snapshot';

const EDITOR_URL = chrome.runtime.getURL('src/editor/index.html');
const PACK_URL = `${chrome.runtime.getURL('src/editor/index.html')}#pack`;

/** Minimum gap between `captureVisibleTab` calls — Chrome throttles to ~2/sec. */
const CAPTURE_THROTTLE_MS = 500;
/** Time to let the page paint/composite after each scroll before capturing. */
const PAINT_SETTLE_MS = 60;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[PageParcel] installed — welcome card will show on first popup open.');
  }
});

chrome.commands.onCommand.addListener((command) => {
  const mode = commandToMode(command);
  if (mode) void handleCapture(mode).catch(onCaptureError);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isCaptureRequest(message)) {
    void handleCapture(message.mode, message.ocr === true).catch(onCaptureError);
  }
  return false; // synchronous: no async sendResponse
});

async function handleCapture(mode: CaptureMode, ocr = false): Promise<void> {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) {
    broadcast({ type: 'CAPTURE_ERROR', code: 'unknown', message: 'No active tab found.' });
    return;
  }
  if (isProtectedUrl(tab.url)) {
    broadcast({
      type: 'CAPTURE_ERROR',
      code: 'protected-page',
      message: "Can't capture this protected page.",
    });
    return;
  }
  switch (mode) {
    case 'page-text':
      await capturePageText(tab, ocr);
      return;
    case 'pack':
      await capturePack(tab);
      return;
    case 'visible':
      await captureVisible(tab);
      return;
    case 'full-page':
      await captureFullPage(tab);
      return;
    case 'region':
      await captureRegion(tab);
      return;
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Inject a self-contained function into `tabId` and return its (awaited) result.
 * Throws if the injection produces no result.
 */
async function execInTab<A extends unknown[], R>(
  tabId: number,
  func: (...args: A) => R,
  args: A,
): Promise<Awaited<R>> {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  const result = results?.[0]?.result;
  if (result === undefined) throw new Error('executeScript returned no result');
  return result as Awaited<R>;
}

/** Inject a fire-and-forget (void) function; its undefined result is ignored. */
async function runInTab<A extends unknown[]>(
  tabId: number,
  func: (...args: A) => unknown,
  args: A,
): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, func, args });
}

async function captureVisibleTabPng(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function captureVisible(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id as number;
  const metrics = await execInTab(tabId, getMetrics, []);
  const windowId = tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  const dataUrl = await captureVisibleTabPng(windowId);
  const width = Math.round(metrics.viewportWidth * metrics.devicePixelRatio);
  const height = Math.round(metrics.viewportHeight * metrics.devicePixelRatio);
  await handoffToEditor(dataUrl, width, height, 'visible', tab.title ?? '');
  broadcast({ type: 'CAPTURE_COMPLETE', imageUrl: dataUrl, width, height });
}

async function captureRegion(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id as number;
  const metrics = await execInTab(tabId, getMetrics, []);
  const rect = await execInTab(tabId, selectRegion, []);
  if (!rect) return; // user pressed Esc — nothing to capture
  const windowId = tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  const tile = await captureVisibleTabPng(windowId);
  const dpr = metrics.devicePixelRatio;
  const x = Math.round(rect.x * dpr);
  const y = Math.round(rect.y * dpr);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  const dataUrl = await execInTab(tabId, cropTile, [tile, x, y, w, h]);
  await handoffToEditor(dataUrl, w, h, 'region', tab.title ?? '');
  broadcast({ type: 'CAPTURE_COMPLETE', imageUrl: dataUrl, width: w, height: h });
}

async function captureFullPage(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id as number;
  const metrics = await execInTab(tabId, getMetrics, []);
  if (metrics.viewportHeight <= 0 || metrics.scrollHeight <= 0) {
    broadcast({
      type: 'CAPTURE_ERROR',
      code: 'blank-page',
      message: 'This page has no scrollable content.',
    });
    return;
  }
  const dpr = metrics.devicePixelRatio;
  const canvasHeight = Math.round(metrics.scrollHeight * dpr);
  if (canvasHeight > MAX_CANVAS_HEIGHT_PX) {
    broadcast({
      type: 'CAPTURE_ERROR',
      code: 'too-large',
      message: `This page is too tall to capture in one image (${canvasHeight}px). Try visible or region mode.`,
    });
    return;
  }

  const positions = computeScrollPositions(metrics.scrollHeight, metrics.viewportHeight);
  const windowId = tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  // When an inner element scrolls, crop each viewport tile to its rect (device px).
  const crop = metrics.container
    ? {
        x: Math.round(metrics.container.x * dpr),
        y: Math.round(metrics.container.y * dpr),
        w: Math.round(metrics.container.width * dpr),
        h: Math.round(metrics.container.height * dpr),
      }
    : null;
  const canvasWidth = crop
    ? crop.w
    : Math.round((metrics.contentWidth ?? metrics.viewportWidth) * dpr);

  // Disable smooth scrolling (but keep fixed elements visible) for the first tile.
  await runInTab(tabId, prepareCapture, []);
  const tiles: TileSpec[] = [];
  try {
    // Tile 0: capture at the top with fixed elements visible so a fixed header
    // appears once at the top of the final image (instead of being omitted).
    {
      await execInTab(tabId, scrollToPosition, [positions[0]]);
      await delay(PAINT_SETTLE_MS);
      const first = await captureVisibleTabPng(windowId);
      tiles.push({ dataUrl: first, y: 0 });
      broadcast({ type: 'CAPTURE_PROGRESS', percent: Math.round((1 / positions.length) * 100) });
    }
    // Remaining tiles: hide fixed elements so they don't duplicate.
    if (positions.length > 1) {
      await runInTab(tabId, hideFixedElements, []);
      for (let i = 1; i < positions.length; i++) {
        await delay(CAPTURE_THROTTLE_MS);
        const { scrollY } = await execInTab(tabId, scrollToPosition, [positions[i]]);
        await delay(PAINT_SETTLE_MS);
        const dataUrl = await captureVisibleTabPng(windowId);
        tiles.push({ dataUrl, y: Math.round(scrollY * dpr) });
        broadcast({
          type: 'CAPTURE_PROGRESS',
          percent: Math.round(((i + 1) / positions.length) * 100),
        });
      }
    }
  } finally {
    await runInTab(tabId, restoreCapture, [metrics.initialScrollY]);
  }

  const dataUrl = await execInTab(tabId, stitchTiles, [tiles, canvasWidth, canvasHeight, crop]);
  await handoffToEditor(dataUrl, canvasWidth, canvasHeight, 'full-page', tab.title ?? '');
  broadcast({
    type: 'CAPTURE_COMPLETE',
    imageUrl: dataUrl,
    width: canvasWidth,
    height: canvasHeight,
  });
}

async function capturePageText(tab: chrome.tabs.Tab, ocr: boolean): Promise<void> {
  const snapshot = await execInTab(tab.id as number, collectPageSnapshot, [true]);
  if (ocr) {
    // Session memory only, and prune abandoned old OCR drafts on the next capture.
    const drafts = (await chrome.storage.session.get(null)) as Record<
      string,
      { capturedAt?: string } | null
    >;
    const stale = Object.entries(drafts)
      .filter(
        ([key, value]) =>
          key.startsWith('pageparcel:text:') &&
          (!value?.capturedAt || !(Date.parse(value.capturedAt) > Date.now() - 300_000)),
      )
      .map(([key]) => key);
    if (stale.length) await chrome.storage.session.remove(stale);
    snapshot.ocr = await execInTab(tab.id as number, collectOcrImages, []);
  }
  const key = `pageparcel:text:${crypto.randomUUID()}`;
  const storage = ocr ? chrome.storage.session : chrome.storage.local;
  await storage.set({ [key]: snapshot });
  try {
    await chrome.tabs.create({ url: `${EDITOR_URL}#text=${encodeURIComponent(key)}` });
  } catch (error) {
    await storage.remove(key);
    throw error;
  }
  broadcast({ type: 'TEXT_COMPLETE' });
}

async function capturePack(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id as number;
  const metrics = await execInTab(tabId, getMetrics, []);
  if (metrics.viewportHeight <= 0 || metrics.scrollHeight <= 0) {
    broadcast({
      type: 'CAPTURE_ERROR',
      code: 'blank-page',
      message: 'This page has no scrollable content.',
    });
    return;
  }

  const dpr = metrics.devicePixelRatio;
  const pageHeight = Math.round(metrics.scrollHeight * dpr);
  if (pageHeight > MAX_BUNDLE_HEIGHT_PX) {
    broadcast({
      type: 'CAPTURE_ERROR',
      code: 'too-large',
      message: `This page is too tall for one Trace Bundle (${pageHeight}px). Capture it in sections.`,
    });
    return;
  }

  const snapshot = await execInTab(tabId, collectPageSnapshot, []);
  const positions = computeScrollPositions(metrics.scrollHeight, metrics.viewportHeight);
  const windowId = tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  const crop = metrics.container
    ? {
        x: Math.round(metrics.container.x * dpr),
        y: Math.round(metrics.container.y * dpr),
        w: Math.round(metrics.container.width * dpr),
        h: Math.round(metrics.container.height * dpr),
      }
    : null;
  const pageWidth = crop
    ? crop.w
    : Math.round((metrics.contentWidth ?? metrics.viewportWidth) * dpr);
  const tileHeight = crop ? crop.h : Math.round(metrics.viewportHeight * dpr);
  const tiles: TileSpec[] = [];
  let viewportContext: CapturePackDraft['viewportContext'];

  await runInTab(tabId, prepareCapture, []);
  try {
    await execInTab(tabId, scrollToPosition, [positions[0]]);
    await delay(PAINT_SETTLE_MS);
    tiles.push({ dataUrl: await captureVisibleTabPng(windowId), y: 0 });
    if (crop) {
      // The stitched page is cropped to the scroll container; keep the surrounding app once.
      viewportContext = {
        dataUrl: tiles[0].dataUrl,
        width: Math.round((metrics.windowWidth ?? metrics.viewportWidth) * dpr),
        height: Math.round((metrics.windowHeight ?? metrics.viewportHeight) * dpr),
      };
    }
    broadcast({ type: 'CAPTURE_PROGRESS', percent: Math.round((1 / positions.length) * 85) });

    if (positions.length > 1) {
      await runInTab(tabId, hideFixedElements, []);
      for (let i = 1; i < positions.length; i++) {
        await delay(CAPTURE_THROTTLE_MS);
        const { scrollY } = await execInTab(tabId, scrollToPosition, [positions[i]]);
        await delay(PAINT_SETTLE_MS);
        tiles.push({ dataUrl: await captureVisibleTabPng(windowId), y: Math.round(scrollY * dpr) });
        broadcast({
          type: 'CAPTURE_PROGRESS',
          percent: Math.round(((i + 1) / positions.length) * 85),
        });
      }
    }
  } finally {
    await runInTab(tabId, restoreCapture, [metrics.initialScrollY]);
  }

  const segmentDefs = computeImageSegments(pageHeight);
  const segments = [];
  for (let i = 0; i < segmentDefs.length; i++) {
    const segment = segmentDefs[i];
    const overlappingTiles = tiles.filter(
      (tile) => tile.y < segment.startY + segment.height && tile.y + tileHeight > segment.startY,
    );
    const dataUrl = await execInTab(tabId, stitchTileSegment, [
      overlappingTiles,
      pageWidth,
      segment.startY,
      segment.height,
      crop,
    ]);
    segments.push({ dataUrl, width: pageWidth, height: segment.height, startY: segment.startY });
    broadcast({
      type: 'CAPTURE_PROGRESS',
      percent: 85 + Math.round(((i + 1) / segmentDefs.length) * 15),
    });
  }

  await setCapturePackDraft({
    snapshot,
    segments,
    pageWidth,
    pageHeight,
    devicePixelRatio: dpr,
    captureMethod: 'full-page-scroll-stitch',
    viewportContext,
  });
  await chrome.tabs.create({ url: PACK_URL });
  broadcast({ type: 'PACK_COMPLETE', segmentCount: segments.length });
}

/**
 * Stash the captured image in storage and open the editor in a new tab. The
 * editor reads the stash on load; export (download) happens from there.
 */
async function handoffToEditor(
  dataUrl: string,
  width: number,
  height: number,
  mode: CaptureMode,
  title: string,
): Promise<void> {
  await setLastCapture({ dataUrl, width, height, mode, title, capturedAt: Date.now() });
  await chrome.tabs.create({ url: EDITOR_URL });
}

function commandToMode(command: string): CaptureMode | null {
  switch (command) {
    case 'capture-page-text':
      return 'page-text';
    case 'capture-trace-bundle':
      return 'pack';
    case 'capture-full-page':
      return 'full-page';
    case 'capture-visible':
      return 'visible';
    case 'capture-region':
      return 'region';
    default:
      return null;
  }
}

function onCaptureError(err: unknown): void {
  console.error('[PageParcel] capture failed', err);
  broadcast({ type: 'CAPTURE_ERROR', code: 'unknown', message: 'Capture failed unexpectedly.' });
}

function broadcast(msg: PopupMessage): void {
  // The popup may already be closed (e.g. region mode); ignore delivery failures.
  void chrome.runtime.sendMessage(msg).catch(() => {
    /* popup not listening */
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCaptureRequest(m: unknown): m is BackgroundMessage {
  return (
    !!m &&
    typeof m === 'object' &&
    (m as { type?: string }).type === 'CAPTURE_REQUEST' &&
    'mode' in m
  );
}
