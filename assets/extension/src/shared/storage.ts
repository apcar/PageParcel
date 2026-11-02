import type { CapturePackDraft, LastCapture, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { LEGACY_DEFAULT_TEMPLATES } from './utils';

const SETTINGS_KEY = 'pageparcel:settings';
const LAST_CAPTURE_KEY = 'pageparcel:last-capture';
const CAPTURE_PACK_KEY = 'pageparcel:bundle-draft';
const LEGACY_SETTINGS_KEY = 'openscreenshot:settings';
const LEGACY_LAST_CAPTURE_KEY = 'openscreenshot:last-capture';

/** Load settings, merged over the defaults so new fields are always present. */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY]);
  const partial = (stored[SETTINGS_KEY] ?? stored[LEGACY_SETTINGS_KEY] ?? {}) as Partial<Settings>;
  const merged = { ...DEFAULT_SETTINGS, ...partial } as Settings & { showOnboarding?: unknown };
  delete merged.showOnboarding;
  // Older builds saved their default template with every settings write, which
  // froze it in storage and hid newer defaults. Treat old defaults as unset.
  if (
    !merged.filenameTemplate?.trim() ||
    LEGACY_DEFAULT_TEMPLATES.includes(merged.filenameTemplate)
  ) {
    merged.filenameTemplate = DEFAULT_SETTINGS.filenameTemplate;
  }
  return merged;
}

/** Persist a partial settings update, merged with the current values. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Stash the most recent capture so the editor page can load it. */
export async function setLastCapture(capture: LastCapture): Promise<void> {
  await chrome.storage.local.set({ [LAST_CAPTURE_KEY]: capture });
}

/** Read the stashed capture, or null if none. */
export async function getLastCapture(): Promise<LastCapture | null> {
  const stored = await chrome.storage.local.get([LAST_CAPTURE_KEY, LEGACY_LAST_CAPTURE_KEY]);
  return (
    ((stored[LAST_CAPTURE_KEY] ?? stored[LEGACY_LAST_CAPTURE_KEY]) as LastCapture | undefined) ??
    null
  );
}

/** Clear the stashed capture (frees storage once the editor has loaded it). */
export async function clearLastCapture(): Promise<void> {
  await chrome.storage.local.remove([LAST_CAPTURE_KEY, LEGACY_LAST_CAPTURE_KEY]);
}

export async function setCapturePackDraft(draft: CapturePackDraft): Promise<void> {
  await chrome.storage.local.set({ [CAPTURE_PACK_KEY]: draft });
}

export async function getCapturePackDraft(): Promise<CapturePackDraft | null> {
  const stored = await chrome.storage.local.get(CAPTURE_PACK_KEY);
  return (stored[CAPTURE_PACK_KEY] as CapturePackDraft | undefined) ?? null;
}

export async function clearCapturePackDraft(): Promise<void> {
  await chrome.storage.local.remove(CAPTURE_PACK_KEY);
}
