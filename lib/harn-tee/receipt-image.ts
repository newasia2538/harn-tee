import type { ReceiptBox } from "./types";

export type ReceiptImageSegment = { x: number; y: number; width: number; height: number };
export type PreparedReceiptImage = {
  canvas: HTMLCanvasElement;
  segments: ReceiptImageSegment[];
  dispose: () => void;
};
type ReceiptPixels = Pick<ImageData, "width" | "height" | "data">;
type CropOptions = { scale?: number; padding?: number; grayscale?: boolean; purpose?: "segment" };

class ReceiptImageError extends Error {}

function brightness(data: Uint8ClampedArray, offset: number) {
  const gray = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
  return 255 + (gray - 255) * (data[offset + 3] / 255);
}

/** Only crop an almost-white frame enclosing substantial content. Shadows,
 * edge content and uncertainty retain the whole image; no specks are discarded. */
export function findReceiptContentBox(image: ReceiptPixels): ReceiptBox | null {
  const { width, height, data } = image;
  let x0 = width, y0 = height, x1 = 0, y1 = 0, ink = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (brightness(data, (y * width + x) * 4) >= 248) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
      ink++;
    }
  }
  const padding = Math.max(12, Math.ceil(width * 0.02));
  if (ink < 24 || ink > width * height * 0.3 || x1 - x0 < width * 0.2 || y1 - y0 < height * 0.2) return null;
  if (x0 <= padding || y0 <= padding || x1 >= width - padding || y1 >= height - padding) return null;
  return { x0: x0 - padding, y0: y0 - padding, x1: x1 + padding, y1: y1 + padding };
}

/** Text slope in degrees (positive slopes down to the right), or null when
 * horizontal/already straight or insufficient evidence. Never infer perspective. */
export function estimateReceiptSkew(image: ReceiptPixels): number | null {
  const { width, height, data } = image;
  const step = Math.max(1, Math.ceil(Math.sqrt(width * height / 500_000)));
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (brightness(data, (y * width + x) * 4) < 160) {
        points.push({ x: (x - width / 2) / step, y: y / step });
      }
    }
  }
  const sampleArea = Math.ceil(width / step) * Math.ceil(height / step);
  if (points.length < 200 || points.length > sampleArea * 0.3) return null;

  // Projection peaks get sharper when repeated text rows are level. A coarse,
  // bounded search and a minimum improvement avoid rotating noisy photographs.
  const offset = Math.ceil(width / step * 0.06) + 2;
  const bins = new Uint32Array(Math.ceil(height / step) + offset * 2);
  let bestAngle = 0, bestScore = 0, straightScore = 0, bestRows = 0;
  for (let angle = -3; angle <= 3; angle += 0.25) {
    bins.fill(0);
    const slope = Math.tan(angle * Math.PI / 180);
    for (const point of points) bins[Math.round(point.y - slope * point.x) + offset]++;
    let score = 0, peak = 0;
    for (const count of bins) {
      score += count * count;
      peak = Math.max(peak, count);
    }
    if (angle === 0) straightScore = score;
    if (score <= bestScore) continue;
    let rows = 0, inRow = false;
    for (const count of bins) {
      const isRow = count >= Math.max(8, peak * 0.5);
      if (isRow && !inRow) rows++;
      inRow = isRow;
    }
    bestScore = score;
    bestAngle = angle;
    bestRows = rows;
  }
  if (Math.abs(bestAngle) < 0.5 || Math.abs(bestAngle) >= 3 || bestScore < straightScore * 1.2 || bestRows < 6) return null;
  return bestAngle;
}

export function planReceiptCrop(size: { width: number; height: number }, box: ReceiptBox, options: CropOptions = {}) {
  validateDimensions(size.width, size.height);
  const { scale = 1, padding = 8 } = options;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(padding) || padding < 0) {
    throw new ReceiptImageError("ขนาดหรือระยะขอบรูปตัวอย่างไม่ถูกต้อง");
  }
  if (!Object.values(box).every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0) {
    throw new ReceiptImageError("กรอบข้อความใบเสร็จไม่ถูกต้อง");
  }
  const left = Math.max(0, Math.floor(box.x0)), top = Math.max(0, Math.floor(box.y0));
  const right = Math.min(size.width, Math.ceil(box.x1)), bottom = Math.min(size.height, Math.ceil(box.y1));
  if (right <= left || bottom <= top) throw new ReceiptImageError("กรอบข้อความอยู่นอกรูปใบเสร็จ");
  const pad = Math.min(256, padding);
  const x0 = left - pad, y0 = top - pad, x1 = right + pad, y1 = bottom + pad;
  const requestedWidth = x1 - x0, requestedHeight = y1 - y0;
  const maxHeight = options.purpose === "segment" ? 2200 : 1000;
  const maxPixels = options.purpose === "segment" ? 4_000_000 : 1_000_000;
  const factor = Math.min(scale, 1800 / requestedWidth, maxHeight / requestedHeight, Math.sqrt(maxPixels / requestedWidth / requestedHeight));
  const width = Math.max(1, Math.floor(requestedWidth * factor));
  const height = Math.max(1, Math.floor(requestedHeight * factor));
  const source = {
    x: Math.max(0, x0), y: Math.max(0, y0),
    width: Math.min(size.width, x1) - Math.max(0, x0),
    height: Math.min(size.height, y1) - Math.max(0, y0),
  };
  // Use the actual rounded output ratios so edge pixels stay inside the canvas.
  const sx = width / requestedWidth, sy = height / requestedHeight;
  return { width, height, source, destination: {
    x: (source.x - x0) * sx, y: (source.y - y0) * sy,
    width: source.width * sx, height: source.height * sy,
  } };
}

const MAX_SOURCE_PIXELS = 8_000_000;
const MAX_SOURCE_WIDTH = 1800;
const SEGMENT_HEIGHT = 2200;
const SEGMENT_OVERLAP = 128;
const MAX_SEGMENTS = 12;
const DIVIDE_IMAGE_ERROR = "รูปใบเสร็จยาวเกินไป กรุณาแบ่งเป็นหลายรูปแล้วลองใหม่";
const PREPARE_ERROR = "เตรียมรูปใบเสร็จไม่ได้ กรุณาลองรูปที่เล็กลงหรือแบ่งเป็นหลายรูป";
const FORMAT_ERROR = "กรุณาเลือกรูปใบเสร็จ JPG, PNG หรือ WebP (รองรับ GIF, BMP และ AVIF ด้วย)";
const DECODE_ERROR = "เปิดรูปใบเสร็จไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP ที่เปิดดูได้";

function validateDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ReceiptImageError("ขนาดรูปใบเสร็จไม่ถูกต้อง กรุณาเลือกรูปใหม่");
  }
}

export function planReceiptSegments(width: number, height: number): ReceiptImageSegment[] {
  validateDimensions(width, height);
  const maxHeight = SEGMENT_HEIGHT + (MAX_SEGMENTS - 1) * (SEGMENT_HEIGHT - SEGMENT_OVERLAP);
  if (height > maxHeight) throw new ReceiptImageError(DIVIDE_IMAGE_ERROR);

  const segments: ReceiptImageSegment[] = [];
  for (let y = 0; y < height; y += SEGMENT_HEIGHT - SEGMENT_OVERLAP) {
    const segmentHeight = Math.min(SEGMENT_HEIGHT, height - y);
    segments.push({ x: 0, y, width, height: segmentHeight });
    if (y + segmentHeight === height) break;
  }
  return segments;
}

export function planReceiptImageSize(width: number, height: number) {
  validateDimensions(width, height);
  const scale = Math.min(1, MAX_SOURCE_WIDTH / width, Math.sqrt(MAX_SOURCE_PIXELS / width / height));
  const size = {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
  // Never shrink again just to fit the segment count: ask for separate photos.
  planReceiptSegments(size.width, size.height);
  return size;
}

function requireBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ReceiptImageError("เตรียมรูปใบเสร็จได้เฉพาะในเบราว์เซอร์");
  }
}

function abortError() {
  const error = new Error("ยกเลิกการเตรียมรูปใบเสร็จ");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function allocateCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } catch {
    releaseCanvas(canvas);
    throw new ReceiptImageError(PREPARE_ERROR);
  }
}

function whiteContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new ReceiptImageError(PREPARE_ERROR);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

function loadImage(image: HTMLImageElement, url: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(abortError());
    image.onload = () => finish();
    image.onerror = () => finish(new ReceiptImageError(DECODE_ERROR));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try { image.src = url; }
    catch { finish(new ReceiptImageError(DECODE_ERROR)); }
  });
}

/** Browser-only, ephemeral source for OCR. Segment rectangles refer to this final
 * canvas, after cropping/deskew. No tile canvases or thresholded originals persist.
 * The caller owns dispose(); aborting the supplied signal also disposes the result. */
export async function prepareReceiptImage(file: File, signal?: AbortSignal): Promise<PreparedReceiptImage> {
  throwIfAborted(signal);
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)) {
    throw new ReceiptImageError(FORMAT_ERROR);
  }
  requireBrowser();
  const owned = new Set<HTMLCanvasElement>();
  let image: HTMLImageElement | undefined;
  let url: string | undefined;
  try {
    image = new Image();
    url = URL.createObjectURL(file);
    await loadImage(image, url, signal);
    throwIfAborted(signal);
    const size = planReceiptImageSize(image.naturalWidth, image.naturalHeight);
    let source = allocateCanvas(size.width, size.height);
    owned.add(source);
    const context = whiteContext(source);
    context.drawImage(image, 0, 0, source.width, source.height);
    throwIfAborted(signal);

    // Full-resolution margin analysis keeps even faint peripheral text. Only the
    // skew estimator samples pixels, to keep its bounded angle search inexpensive.
    const pixels = context.getImageData(0, 0, source.width, source.height);
    const content = findReceiptContentBox(pixels);
    const angle = estimateReceiptSkew(pixels);
    throwIfAborted(signal);
    if (content || angle !== null) {
      const box = content ?? { x0: 0, y0: 0, x1: source.width, y1: source.height };
      const width = box.x1 - box.x0, height = box.y1 - box.y0;
      const radians = -(angle ?? 0) * Math.PI / 180;
      const sin = Math.abs(Math.sin(radians)), cos = Math.cos(radians);
      // Expand before rotating; resizing the enclosure retains every source edge.
      const rotatedWidth = Math.ceil(width * cos + height * sin);
      const rotatedHeight = Math.ceil(height * cos + width * sin);
      const finalSize = planReceiptImageSize(rotatedWidth, rotatedHeight);
      const transformed = allocateCanvas(finalSize.width, finalSize.height);
      owned.add(transformed);
      const target = whiteContext(transformed);
      target.translate(transformed.width / 2, transformed.height / 2);
      target.scale(transformed.width / rotatedWidth, transformed.height / rotatedHeight);
      target.rotate(radians);
      target.drawImage(source, box.x0, box.y0, width, height, -width / 2, -height / 2, width, height);
      throwIfAborted(signal);
      releaseCanvas(source);
      owned.delete(source);
      source = transformed;
    }
    const canvas = source;
    const segments = planReceiptSegments(canvas.width, canvas.height);
    const dispose = () => {
      signal?.removeEventListener("abort", dispose);
      releaseCanvas(canvas);
    };
    throwIfAborted(signal);
    signal?.addEventListener("abort", dispose, { once: true });
    owned.delete(canvas);
    return { canvas, segments, dispose };
  } catch (error) {
    if (error instanceof ReceiptImageError || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new ReceiptImageError(PREPARE_ERROR);
  } finally {
    for (const canvas of owned) releaseCanvas(canvas);
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }
    if (url !== undefined) URL.revokeObjectURL(url);
  }
}

/** A bounded color preview by default. Padding is in source pixels; scale is
 * capped by 1800px width, 1000px height and 1MP. Caller releases the returned canvas
 * (width = height = 0) after use; disposing the prepared source does not own crops. */
export function createReceiptCrop(canvas: HTMLCanvasElement, box: ReceiptBox, options: CropOptions = {}): HTMLCanvasElement {
  requireBrowser();
  const plan = planReceiptCrop(canvas, box, options);
  const crop = allocateCanvas(plan.width, plan.height);
  try {
    const context = whiteContext(crop);
    if (options.grayscale) context.filter = "grayscale(100%)";
    const source = plan.source, destination = plan.destination;
    context.drawImage(canvas, source.x, source.y, source.width, source.height,
      destination.x, destination.y, destination.width, destination.height);
    return crop;
  } catch {
    releaseCanvas(crop);
    throw new ReceiptImageError(PREPARE_ERROR);
  }
}
