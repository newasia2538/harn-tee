import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disposeReceiptOcrWorker,
  MAX_RECEIPT_FILE_BYTES,
  recognizeReceipt,
  validateReceiptImage,
} from "../../lib/harn-tee/receipt-ocr";

const mocks = vi.hoisted(() => ({ createWorker: vi.fn(), prepareReceiptImage: vi.fn(), createReceiptCrop: vi.fn(), dispose: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));
vi.mock("../../lib/harn-tee/receipt-image", () => ({ prepareReceiptImage: mocks.prepareReceiptImage, createReceiptCrop: mocks.createReceiptCrop }));
const mockedCreateWorker = mocks.createWorker;

beforeEach(() => {
  mocks.dispose.mockReset();
  mocks.prepareReceiptImage.mockResolvedValue({ canvas: { width: 600, height: 1000 }, segments: [{ x: 0, y: 0, width: 600, height: 1000 }], dispose: mocks.dispose });
  mocks.createReceiptCrop.mockImplementation(() => ({ width: 400, height: 80, toDataURL: () => "data:image/png;base64,dGVzdA==" }));
});

function page(price: string, priceConfidence = 95, y = 20) {
  return { data: { text: "ชาเย็น " + price, confidence: 95, blocks: [{ paragraphs: [{ lines: [{ text: "ชาเย็น " + price, confidence: 95, bbox: { x0: 10, y0: y, x1: 180, y1: y + 25 }, words: [
    { text: "ชาเย็น", confidence: 95, bbox: { x0: 10, y0: y, x1: 90, y1: y + 25 } },
    { text: price, confidence: priceConfidence, bbox: { x0: 140, y0: y, x1: 180, y1: y + 25 } },
  ] }] }] }] } };
}

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
          blocks: [{ paragraphs: [{ lines: [{
            text: "ข้าว 25", confidence: 88,
            bbox: { x0: 10, y0: 20, x1: 180, y1: 45 },
            words: [
              { text: "ข้าว", confidence: 92, bbox: { x0: 10, y0: 20, x1: 90, y1: 45 } },
              { text: "25", confidence: 88, bbox: { x0: 140, y0: 20, x1: 180, y1: 45 } },
            ],
          }] }] }],
        },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    mockedCreateWorker.mockResolvedValue(worker);
    const progress: string[] = [];

    const result = await recognizeReceipt(
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
      { onProgress: (event) => progress.push(event.phase) },
    );

    expect(result).toMatchObject({
      rawText: "ข้าว 25",
      lines: [{ text: "ข้าว 25", confidence: 88, bbox: { x0: 10, y0: 20, x1: 180, y1: 45 } }],
    });
    expect(worker.recognize).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ blocks: true }));
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

  it("offers a conflicting re-read price without silently replacing the original", async () => {
    const worker = { recognize: vi.fn().mockResolvedValueOnce(page("75.00", 35)).mockResolvedValueOnce({ data: { text: "85.00", confidence: 96 } }), terminate: vi.fn() };
    mockedCreateWorker.mockResolvedValue(worker);
    const result = await recognizeReceipt(new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    expect(result.items[0]).toMatchObject({ priceSatang: 7500, suggestedPriceSatang: 8500, status: "needs-review", previewUrl: expect.stringContaining("data:image/") });
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("keeps coordinates and repeated purchases from sequential receipt sections", async () => {
    mocks.prepareReceiptImage.mockResolvedValue({ canvas: { width: 600, height: 3000 }, segments: [{ x: 0, y: 0, width: 600, height: 2000 }, { x: 0, y: 1900, width: 600, height: 1100 }], dispose: mocks.dispose });
    const worker = { recognize: vi.fn().mockResolvedValue(page("75.00")), terminate: vi.fn() };
    mockedCreateWorker.mockResolvedValue(worker);
    const result = await recognizeReceipt(new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    expect(result.lines.map((line) => line.bbox?.y0)).toEqual([20, 1920]);
    expect(result.items).toHaveLength(2);
  });

  it("cleans the prepared image when the OCR engine fails", async () => {
    mockedCreateWorker.mockResolvedValue({ recognize: vi.fn().mockRejectedValue(new Error("engine error")), terminate: vi.fn() });
    await expect(recognizeReceipt(new File(["image"], "receipt.jpg", { type: "image/jpeg" }))).rejects.toThrow("engine error");
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("bounds optional price retries instead of rescanning every uncertain item", async () => {
    const fixture = page("75.00", 30);
    fixture.data.blocks[0].paragraphs[0].lines = Array.from({ length: 6 }, (_, index) => page("75.00", 30, 20 + index * 70).data.blocks[0].paragraphs[0].lines[0]);
    const worker = { recognize: vi.fn().mockResolvedValueOnce(fixture).mockResolvedValue({ data: { text: "75.00", confidence: 90 } }), terminate: vi.fn() };
    mockedCreateWorker.mockResolvedValue(worker);
    const result = await recognizeReceipt(new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    expect(result.items).toHaveLength(6);
    expect(worker.recognize).toHaveBeenCalledTimes(5);
  });

  it("stops subsequent sections and releases the image after cancellation", async () => {
    const controller = new AbortController();
    const worker = { recognize: vi.fn().mockImplementation(async () => { controller.abort(); return page("75.00"); }), terminate: vi.fn() };
    mockedCreateWorker.mockResolvedValue(worker);
    await expect(recognizeReceipt(new File(["image"], "receipt.jpg", { type: "image/jpeg" }), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(worker.recognize).toHaveBeenCalledOnce();
  });
});
