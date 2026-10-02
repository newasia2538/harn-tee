// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptScanner } from "../../components/harn-tee/receipt-scanner";
import type { ReceiptOcrResult } from "../../lib/harn-tee/receipt-ocr";
import type { ParticipantDraft } from "../../lib/harn-tee/types";

const mocks = vi.hoisted(() => ({
  recognizeReceipt: vi.fn(),
  disposeReceiptOcrWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/harn-tee/receipt-ocr", () => mocks);

const participants: ParticipantDraft[] = [{ id: "person-a", name: "เอ", order: 0 }];

function result(lines: ReceiptOcrResult["lines"]): ReceiptOcrResult {
  return { rawText: lines.map((line) => line.text).join("\n"), lines };
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
