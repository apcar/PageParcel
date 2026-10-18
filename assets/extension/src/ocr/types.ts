export interface OcrImage {
  label: string;
  dataUrl: string;
}
export interface OcrResult {
  label: string;
  text: string;
  confidence: number;
}
export interface OcrCapture {
  images: OcrImage[];
  omitted: number;
  results?: OcrResult[];
  error?: string;
}
