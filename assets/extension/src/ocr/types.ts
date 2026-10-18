export interface OcrImage {
  label: string;
  dataUrl: string;
}
export interface OcrResult {
  label: string;
  text: string;
  confidence: number;
}
export type OcrSkipReason =
  | 'covered'
  | 'image-limit'
  | 'not-loaded'
  | 'pixel-limit'
  | 'browser-security'
  | 'canvas-unavailable'
  | 'read-failed';
export interface OcrSkip {
  label: string;
  reason: OcrSkipReason;
}
export interface OcrCapture {
  skipped?: OcrSkip[];
  images: OcrImage[];
  omitted: number;
  results?: OcrResult[];
  error?: string;
}
