/**
 * Shared types for OpenScreenShot — message protocol, capture modes, and settings.
 * Imported by the popup, background service worker, and (later) the editor.
 */

/** Capture modes offered in the popup. */
export type CaptureMode = 'pack' | 'page-text' | 'full-page' | 'visible' | 'region';

// --- Popup → Background (capture requests) -------------------------------

import type { OcrCapture } from '../ocr/types';

export interface CaptureRequest {
  type: 'CAPTURE_REQUEST';
  mode: CaptureMode;
  ocr?: boolean;
}

export type BackgroundMessage = CaptureRequest;

// --- Background → Popup (progress / result / error) ----------------------

export interface CaptureProgress {
  type: 'CAPTURE_PROGRESS';
  percent: number;
  message?: string;
}

export interface CaptureComplete {
  type: 'CAPTURE_COMPLETE';
  imageUrl: string;
  width: number;
  height: number;
}

export interface PackComplete {
  type: 'PACK_COMPLETE';
  segmentCount: number;
}

export type CaptureErrorCode =
  'protected-page' | 'blank-page' | 'too-large' | 'not-implemented' | 'unknown';

export interface CaptureError {
  type: 'CAPTURE_ERROR';
  code: CaptureErrorCode;
  message: string;
}

export type PopupMessage =
  CaptureProgress | CaptureComplete | PackComplete | { type: 'TEXT_COMPLETE' } | CaptureError;

// --- Capture geometry (in-page measurement results) -----------------------

export interface Metrics {
  scrollHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  /**
   * CSS-px width of the scrolled content, excluding a classic (space-taking)
   * scrollbar. Full-page tiles are cropped to this width.
   */
  contentWidth?: number;
  /** CSS-px size of the browser viewport (the full captureVisibleTab frame). */
  windowWidth?: number;
  windowHeight?: number;
  devicePixelRatio: number;
  initialScrollY: number;
  /**
   * Viewport-relative CSS-px rect of the inner scroll container, when the page
   * scrolls an element rather than the document (common in SPAs). Tiles are
   * cropped to this rect. `null` means the document itself scrolls.
   */
  container: PageRect | null;
}

export interface PageSnapshot {
  shadowCodeBlocks?: number;
  ocr?: OcrCapture;
  title: string;
  url: string;
  language: string;
  description: string;
  html: string;
  capturedAt: string;
  truncated: boolean;
}

export interface CapturePackDraft {
  snapshot: PageSnapshot;
  segments: Array<{
    dataUrl: string;
    width: number;
    height: number;
    startY: number;
  }>;
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  captureMethod: 'full-page-scroll-stitch';
  /**
   * When an inner element scrolls, the uncropped first viewport, which shows the
   * surrounding app chrome (headers, sidebars) that the stitched page omits.
   */
  viewportContext?: { dataUrl: string; width: number; height: number };
}

/** A rectangle in CSS pixels (viewport-relative for region select). */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One captured viewport tile placed at vertical device-pixel offset `y`. */
export interface TileSpec {
  dataUrl: string;
  y: number;
}

/** The most recent capture, stashed in storage so the editor page can load it. */
export interface LastCapture {
  dataUrl: string;
  width: number;
  height: number;
  mode: CaptureMode;
  title: string;
  capturedAt: number;
}

// --- Settings --------------------------------------------------------------

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'pdf';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
  defaultFormat: ExportFormat;
  theme: ThemePreference;
  // PDF defaults (used from M3 onward; stored now so settings are stable)
  pdfPageSize: 'a4' | 'letter' | 'full';
  pdfOrientation: 'portrait' | 'landscape';
  pdfMultiPage: boolean;
  pdfMarginMm: number;
  quality: number; // 0..1, JPEG/WebP/PDF quality
  filenameTemplate: string;
  showOnboarding: boolean;
  // Annotation style (remembered across sessions)
  annotationColor: string;
  annotationStrokeWidth: number;
  annotationFontSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'png',
  theme: 'system',
  pdfPageSize: 'a4',
  pdfOrientation: 'portrait',
  pdfMultiPage: true,
  pdfMarginMm: 8,
  quality: 0.92,
  filenameTemplate: 'screenshot_{date}_{time}',
  showOnboarding: true,
  annotationColor: '#ff3b30',
  annotationStrokeWidth: 6,
  annotationFontSize: 28,
};
