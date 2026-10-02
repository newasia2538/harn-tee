import type { ReceiptOcrLine } from "./types";

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024;

export type ReceiptOcrProgress = {
  phase: "preparing" | "loading-model" | "recognizing";
  progress: number;
  message: string;
};

export type ReceiptOcrResult = {
  rawText: string;
  lines: ReceiptOcrLine[];
};

type TesseractWorker = {
  recognize: (image: Blob | File) => Promise<{
    data: {
      text?: string;
      lines?: Array<{ text?: string; confidence?: number }>;
    };
  }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;
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

async function prepareReceiptImage(
  file: File,
  signal: AbortSignal | undefined,
  onProgress: ((progress: ReceiptOcrProgress) => void) | undefined,
): Promise<Blob | File> {
  throwIfAborted(signal);
  emitProgress(onProgress, {
    phase: "preparing",
    progress: 0.1,
    message: "กำลังเตรียมรูปใบเสร็จ",
  });

  // Vitest and server evaluation do not have browser image APIs. The real browser
  // path below performs the preprocessing before handing the image to Tesseract.
  if (typeof window === "undefined" || typeof document === "undefined" || typeof Image === "undefined") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("เปิดรูปใบเสร็จไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP"));
      element.src = objectUrl;
    });
    throwIfAborted(signal);

    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เตรียมรูปใบเสร็จไม่ได้ กรุณาลองใหม่");
    context.filter = "grayscale(100%) contrast(115%)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("แปลงรูปใบเสร็จไม่ได้ กรุณาลองใหม่"))),
        "image/jpeg",
        0.92,
      );
    });
    throwIfAborted(signal);
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function getWorker(): Promise<TesseractWorker> {
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
      }) as Promise<TesseractWorker>)
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

  activeProgress = options.onProgress ?? null;
  try {
    const image = await prepareReceiptImage(file, options.signal, options.onProgress);
    throwIfAborted(options.signal);
    const worker = await getWorker();
    throwIfAborted(options.signal);
    emitProgress(options.onProgress, {
      phase: "recognizing",
      progress: 0,
      message: "กำลังอ่านข้อความในใบเสร็จ",
    });
    const result = await worker.recognize(image);
    throwIfAborted(options.signal);

    const rawText = result.data.text ?? "";
    const lines = result.data.lines?.map((line) => ({
      text: line.text ?? "",
      confidence: typeof line.confidence === "number" && Number.isFinite(line.confidence)
        ? line.confidence
        : null,
    })) ?? rawText.split(/\r?\n/).map((text) => ({ text, confidence: null }));

    emitProgress(options.onProgress, {
      phase: "recognizing",
      progress: 1,
      message: "อ่านใบเสร็จเสร็จแล้ว",
    });
    return { rawText, lines };
  } finally {
    activeProgress = null;
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
