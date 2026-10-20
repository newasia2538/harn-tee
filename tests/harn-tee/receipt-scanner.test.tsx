// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptScanner } from "../../components/harn-tee/receipt-scanner";
import type { ReceiptOcrResult } from "../../lib/harn-tee/receipt-ocr";
import type { ParticipantDraft } from "../../lib/harn-tee/types";
import { parseReceiptLines } from "../../lib/harn-tee/receipt-parser";

const mocks = vi.hoisted(() => ({
  recognizeReceipt: vi.fn(),
  disposeReceiptOcrWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/harn-tee/receipt-ocr", () => mocks);

const participants: ParticipantDraft[] = [{ id: "person-a", name: "เอ", order: 0 }];

function result(lines: ReceiptOcrResult["lines"]): ReceiptOcrResult {
  return { rawText: lines.map((line) => line.text).join("\n"), lines, items: parseReceiptLines(lines), ignoredLines: [], subtotalSatang: null };
}

function renderScanner(onImport = vi.fn()) {
  return {
    onImport,
    ...render(<ReceiptScanner participants={participants} onImport={onImport} />),
  };
}

afterEach(() => {
  cleanup();
  mocks.recognizeReceipt.mockReset();
  mocks.disposeReceiptOcrWorker.mockClear();
  vi.unstubAllGlobals();
});

describe("ReceiptScanner", () => {
  it("keeps uncertain prices under review while showing the image and accepting an explicit correction", async () => {
    mocks.recognizeReceipt.mockResolvedValue({
      ...result([]),
      items: [{ id: "ocr-1", name: "ชาเย็น", priceSatang: 7500, confidence: 40, status: "needs-review", rawLine: "ชาเย็น 75.00", reviewReasons: ["ราคาอ่านไม่ชัด"], previewUrl: "data:image/png;base64,dGVzdA==", suggestedPriceSatang: 8500 }],
    });
    const user = userEvent.setup();
    const { onImport } = renderScanner();
    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("img", { name: "ภาพรายการที่ 1" })).toBeTruthy();
    expect(screen.getByText("ราคาอ่านไม่ชัด")).toBeTruthy();
    const importButton = screen.getByRole("button", { name: "เพิ่มเข้ารายการสินค้า" });
    await user.type(screen.getByRole("textbox", { name: "ชื่อรายการที่ 1" }), " ใหญ่");
    expect(importButton).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "ใช้ราคา 85.00 บาท" }));
    expect(screen.getByDisplayValue("85.00")).toBeTruthy();
    expect(importButton).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "ยืนยันรายการที่ 1" }));
    await user.click(importButton);
    expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ name: "ชาเย็น ใหญ่", priceSatang: 8500, status: "ready" })]);
    expect(onImport.mock.calls[0][0][0].previewUrl).toBeUndefined();
  });

  it("shows a receipt subtotal discrepancy without applying extra tax or changing item prices", async () => {
    mocks.recognizeReceipt.mockResolvedValue({ ...result([{ text: "ข้าว 150", confidence: 90 }]), subtotalSatang: 10000, ignoredLines: ["Cash 200.00"] });
    const user = userEvent.setup();
    renderScanner();
    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText(/ต่างจากยอดสินค้าในใบเสร็จ/)).toBeTruthy();
    expect(screen.getByDisplayValue("150.00")).toBeTruthy();
  });
  it("renders an accessible camera/file input in idle state", () => {
    renderScanner();

    expect(screen.getByRole("button", { name: "ถ่ายรูปใบเสร็จ" })).toBeTruthy();
    const input = screen.getByLabelText("เลือกรูปใบเสร็จ") as HTMLInputElement;
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("environment");
  });

  it("shows reading progress and editable review rows after selecting an image", async () => {
    mocks.recognizeReceipt.mockImplementation(async (_file, options) => {
      options?.onProgress?.({ phase: "recognizing", progress: 0.5, message: "กำลังอ่าน" });
      return result([{ text: "ข้าว 25", confidence: 90 }]);
    });
    const user = userEvent.setup();
    renderScanner();

    await user.upload(
      screen.getByLabelText("เลือกรูปใบเสร็จ"),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByDisplayValue("ข้าว")).toBeTruthy();
    expect(screen.getByDisplayValue("25.00")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("requires fixing review rows before import", async () => {
    mocks.recognizeReceipt.mockResolvedValue(result([{ text: "ข้าว", confidence: 90 }]));
    const user = userEvent.setup();
    const { onImport } = renderScanner();

    await user.upload(
      screen.getByLabelText("เลือกรูปใบเสร็จ"),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByText("ตรวจสอบ")).toBeTruthy();
    const importButton = screen.getByRole("button", { name: "เพิ่มเข้ารายการสินค้า" });
    expect(importButton).toHaveProperty("disabled", true);

    await user.type(screen.getByRole("textbox", { name: "ราคาของรายการที่ 1" }), "25");
    expect(importButton).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "ยืนยันรายการที่ 1" }));
    expect(importButton).toHaveProperty("disabled", false);
    await user.click(importButton);
    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({ name: "ข้าว", priceSatang: 2500, status: "ready" }),
    ]);
  });

  it("allows adding and deleting review rows", async () => {
    mocks.recognizeReceipt.mockResolvedValue(result([{ text: "ข้าว 25", confidence: 90 }]));
    const user = userEvent.setup();
    renderScanner();

    await user.upload(
      screen.getByLabelText("เลือกรูปใบเสร็จ"),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));
    expect(screen.getByRole("textbox", { name: "ชื่อรายการที่ 2" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ลบรายการที่ 2" }));
    expect(screen.queryByRole("textbox", { name: "ชื่อรายการที่ 2" })).toBeNull();
  });

  it("does not import when cancelled during reading or review", async () => {
    let resolveScan: ((value: ReceiptOcrResult) => void) | undefined;
    mocks.recognizeReceipt.mockImplementation(
      () => new Promise<ReceiptOcrResult>((resolve) => { resolveScan = resolve; }),
    );
    const user = userEvent.setup();
    const { onImport } = renderScanner();
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), file);
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ถ่ายรูปใบเสร็จ" })).toBeTruthy();
    expect(mocks.disposeReceiptOcrWorker).toHaveBeenCalled();

    mocks.recognizeReceipt.mockResolvedValue(result([{ text: "ข้าว 25", confidence: 90 }]));
    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), file);
    await user.click(await screen.findByRole("button", { name: "ยกเลิก" }));
    expect(onImport).not.toHaveBeenCalled();
    resolveScan?.(result([{ text: "ข้าว 25", confidence: 90 }]));
  });

  it("shows retry and manual-entry paths for OCR errors and empty results", async () => {
    mocks.recognizeReceipt.mockRejectedValueOnce(new Error("ocr failed"));
    const user = userEvent.setup();
    renderScanner();
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), file);
    expect(await screen.findByText("อ่านใบเสร็จไม่สำเร็จ กรุณาลองใหม่หรือกรอกเอง")).toBeTruthy();

    mocks.recognizeReceipt.mockResolvedValueOnce(result([]));
    await user.click(screen.getByRole("button", { name: "ลองใหม่" }));
    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), new File(["receipt-2"], "receipt-2.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("อ่านไม่พบรายการ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "กลับไปกรอกเอง" })).toBeTruthy();
  });

  it("never calls the bill API during scan and review", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.recognizeReceipt.mockResolvedValue(result([{ text: "ข้าว 25", confidence: 90 }]));
    const user = userEvent.setup();
    renderScanner();

    await user.upload(
      screen.getByLabelText("เลือกรูปใบเสร็จ"),
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the OCR worker alive while scanning multiple times in one session", async () => {
    mocks.recognizeReceipt.mockResolvedValue(result([{ text: "ข้าว 25", confidence: 90 }]));
    const user = userEvent.setup();
    const { onImport } = renderScanner();
    const input = screen.getByLabelText("เลือกรูปใบเสร็จ");

    await user.upload(input, new File(["receipt-1"], "receipt-1.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: "เพิ่มเข้ารายการสินค้า" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(mocks.disposeReceiptOcrWorker).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText("เลือกรูปใบเสร็จ"), new File(["receipt-2"], "receipt-2.jpg", { type: "image/jpeg" }));
    await screen.findByRole("button", { name: "เพิ่มเข้ารายการสินค้า" });
    expect(mocks.recognizeReceipt).toHaveBeenCalledTimes(2);
  });
});
