import type { Page, Worker } from "tesseract.js";
import type { ReceiptBox, ReceiptOcrItem, ReceiptOcrLine } from "./types";
import { createReceiptCrop, prepareReceiptImage, type PreparedReceiptImage } from "./receipt-image";
import { analyzeReceiptLines } from "./receipt-parser";

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024;

export type ReceiptOcrProgress = {
  phase: "preparing" | "loading-model" | "recognizing";
  progress: number;
  message: string;
};

export type ReceiptOcrResult = {
  rawText: string;
  lines: ReceiptOcrLine[];
  items: ReceiptOcrItem[];
  ignoredLines: string[];
  subtotalSatang: number | null;
};

let workerPromise: Promise<Worker> | null = null;
let activeProgress: ((progress: ReceiptOcrProgress) => void) | null = null;

function abortError() {
  const error = new Error("ยกเลิกการอ่าน");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function emitProgress(
  onProgress: ((progress: ReceiptOcrProgress) => void) | undefined,
  progress: ReceiptOcrProgress,
) {
  onProgress?.(progress);
}

export function validateReceiptImage(file: File): { valid: true } | { valid: false; error: string } {
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "ไฟล์ต้องเป็นรูปภาพ" };
  }
  if (file.size > MAX_RECEIPT_FILE_BYTES) {
    return { valid: false, error: "ไฟล์ใบเสร็จต้องมีขนาดไม่เกิน 10 MB" };
  }
  return { valid: true };
}

function shiftBox(box: ReceiptBox, x: number, y: number): ReceiptBox {
  return { x0: box.x0 + x, y0: box.y0 + y, x1: box.x1 + x, y1: box.y1 + y };
}

function extractLines(data: Page, x: number, y: number): ReceiptOcrLine[] {
  const lines = data.blocks?.flatMap((block) => block.paragraphs).flatMap((paragraph) => paragraph.lines);
  if (!lines?.length) return (data.text ?? "").split(/\r?\n/).map((text) => ({ text, confidence: null }));
  return lines.map((line) => ({
    text: line.text,
    confidence: Number.isFinite(line.confidence) ? line.confidence : null,
    bbox: shiftBox(line.bbox, x, y),
    words: (line.words ?? []).map((word) => ({ text: word.text, bbox: shiftBox(word.bbox, x, y), confidence: Number.isFinite(word.confidence) ? word.confidence : null })),
  }));
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function readPrice(text: string): number | null {
  const token = text.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token)) return null;
  const value = Math.round(Number(token.replace(/,/g, "")) * 100);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) => createWorker("tha+eng", 1, {
        logger: (event) => {
          const isRecognition = event.status.toLocaleLowerCase().includes("recogniz");
          activeProgress?.({
            phase: isRecognition ? "recognizing" : "loading-model",
            progress: Math.max(0, Math.min(1, event.progress ?? 0)),
            message: isRecognition ? "กำลังอ่านข้อความในใบเสร็จ" : "กำลังเตรียมตัวอ่านใบเสร็จ",
          });
        },
      }))
      .catch((error) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

export async function recognizeReceipt(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (progress: ReceiptOcrProgress) => void } = {},
): Promise<ReceiptOcrResult> {
  const validation = validateReceiptImage(file);
  if (!validation.valid) throw new Error(validation.error);
  throwIfAborted(options.signal);

  let prepared: PreparedReceiptImage | null = null;
  let section = 0;
  let sectionCount = 1;
  let retrying = false;
  const report = (progress: ReceiptOcrProgress) => options.onProgress?.(progress.phase === "recognizing" ? {
    ...progress,
    progress: retrying ? 0.9 : (section + progress.progress) / sectionCount * 0.85,
    message: retrying ? "กำลังตรวจราคาที่อ่านไม่ชัด" : `กำลังอ่านส่วนที่ ${section + 1} จาก ${sectionCount}`,
  } : progress);
  activeProgress = report;
  try {
    emitProgress(options.onProgress, { phase: "preparing", progress: 0, message: "กำลังเตรียมรูปใบเสร็จ" });
    prepared = await prepareReceiptImage(file, options.signal);
    throwIfAborted(options.signal);
    const worker = await getWorker();
    throwIfAborted(options.signal);
    emitProgress(options.onProgress, {
      phase: "recognizing",
      progress: 0,
      message: "กำลังอ่านข้อความในใบเสร็จ",
    });
    const lines: ReceiptOcrLine[] = [];
    const textParts: string[] = [];
    sectionCount = prepared.segments.length;
    for (const segment of prepared.segments) {
      throwIfAborted(options.signal);
      const tile = sectionCount === 1 ? prepared.canvas : createReceiptCrop(prepared.canvas, { x0: segment.x, y0: segment.y, x1: segment.x + segment.width, y1: segment.y + segment.height }, { padding: 0, purpose: "segment" });
      try {
        const result = await worker.recognize(tile, {}, { blocks: true });
        throwIfAborted(options.signal);
        textParts.push(result.data.text ?? "");
        lines.push(...extractLines(result.data, segment.x, segment.y));
      } finally {
        if (tile !== prepared.canvas) releaseCanvas(tile);
      }
      section++;
    }
    const analysis = analyzeReceiptLines(lines);
    let retries = 0;
    for (const item of analysis.items) {
      throwIfAborted(options.signal);
      if (item.sourceBox) {
        const snippet = createReceiptCrop(prepared.canvas, item.sourceBox, { padding: 8 });
        try { item.previewUrl = snippet.toDataURL("image/png"); } finally { releaseCanvas(snippet); }
      }
      if (!item.priceBox || (item.priceConfidence !== null && item.priceConfidence !== undefined && item.priceConfidence >= 75) || retries >= 4) continue;
      retries++;
      retrying = true;
      report({ phase: "recognizing", progress: 0, message: "" });
      const priceImage = createReceiptCrop(prepared.canvas, item.priceBox, { scale: 2, padding: 6, grayscale: true });
      try {
        // Tesseract supports per-call parameters and restores them afterwards;
        // its RecognizeOptions type lists only the image options.
        const parameters = { rotateAuto: false, tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789.,-" };
        const second = await worker.recognize(priceImage, parameters, { blocks: true });
        throwIfAborted(options.signal);
        const price = readPrice(second.data.text ?? "");
        if (price !== null && second.data.confidence >= 80 && price !== item.priceSatang) {
          item.suggestedPriceSatang = price;
          item.status = "needs-review";
          item.reviewReasons = [...(item.reviewReasons ?? []), "อ่านราคาซ้ำได้ค่าต่างกัน กรุณาเทียบกับภาพ"];
        }
      } catch (error) {
        throwIfAborted(options.signal);
        // An optional price retry must not discard the first OCR result.
        if (error instanceof Error && error.name === "AbortError") throw error;
      } finally { releaseCanvas(priceImage); }
    }

    emitProgress(options.onProgress, {
      phase: "recognizing",
      progress: 1,
      message: "อ่านใบเสร็จเสร็จแล้ว",
    });
    return { rawText: textParts.join("\n"), lines, ...analysis };
  } finally {
    prepared?.dispose();
    if (activeProgress === report) activeProgress = null;
  }
}

export async function disposeReceiptOcrWorker() {
  const pendingWorker = workerPromise;
  workerPromise = null;
  activeProgress = null;
  if (!pendingWorker) return;
  const worker = await pendingWorker.catch(() => null);
  await worker?.terminate();
}
