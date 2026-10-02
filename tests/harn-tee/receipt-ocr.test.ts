import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "tesseract.js";
import {
  disposeReceiptOcrWorker,
  MAX_RECEIPT_FILE_BYTES,
  recognizeReceipt,
  validateReceiptImage,
} from "../../lib/harn-tee/receipt-ocr";

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(),
}));

const mockedCreateWorker = vi.mocked(createWorker);

afterEach(async () => {
  await disposeReceiptOcrWorker();
  mockedCreateWorker.mockReset();
});

describe("validateReceiptImage", () => {
  it("accepts an image at the 10 MB limit", () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_FILE_BYTES)], "receipt.jpg", {
      type: "image/jpeg",
    });

    expect(validateReceiptImage(file)).toEqual({ valid: true });
  });

  it("rejects non-images and files above the limit", () => {
    const pdf = new File(["receipt"], "receipt.pdf", { type: "application/pdf" });
    const oversized = new File(
      [new Uint8Array(MAX_RECEIPT_FILE_BYTES + 1)],
      "receipt.jpg",
      { type: "image/jpeg" },
    );

    expect(validateReceiptImage(pdf)).toEqual({ valid: false, error: "ไฟล์ต้องเป็นรูปภาพ" });
    expect(validateReceiptImage(oversized)).toEqual({
      valid: false,
      error: "ไฟล์ใบเสร็จต้องมีขนาดไม่เกิน 10 MB",
    });
  });
});

describe("recognizeReceipt", () => {
  it("returns OCR text and lines while reporting progress", async () => {
    const worker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: "ข้าว 25",
          lines: [{ text: "ข้าว 25", confidence: 88 }],
        },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    mockedCreateWorker.mockResolvedValue(worker as never);
    const progress: string[] = [];

    const result = await recognizeReceipt(
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
      { onProgress: (event) => progress.push(event.phase) },
    );

    expect(result).toEqual({
      rawText: "ข้าว 25",
      lines: [{ text: "ข้าว 25", confidence: 88 }],
    });
    expect(progress).toContain("preparing");
    expect(progress).toContain("recognizing");
    expect(mockedCreateWorker).toHaveBeenCalledWith("tha+eng", expect.anything(), expect.anything());

    await disposeReceiptOcrWorker();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("stops before starting OCR when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      recognizeReceipt(
        new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockedCreateWorker).not.toHaveBeenCalled();
  });
});
