// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentSummary } from "../../components/harn-tee/payment-summary";
import type { BillDocument } from "../../lib/harn-tee/types";

afterEach(cleanup);

const document: BillDocument = {
  version: 1,
  status: "published",
  title: "มื้อเย็น",
  participants: [],
  items: [],
  vatPercent: 0,
  serviceChargePercent: 0,
  recipient: {
    name: "มิน",
    bank: { bankId: "SCB", accountNumber: "1234567890" },
    promptPay: { type: "phone", value: "0812345678" },
    qr: null,
    visible: true,
  },
  createdAt: 1,
  updatedAt: 1,
};

describe("PaymentSummary privacy controls", () => {
  it("masks account and PromptPay values and does not load QR until requested", () => {
    render(<PaymentSummary document={document} token="share-key" qrAvailable />);

    expect(screen.getByText("••••••••7890")).toBeTruthy();
    expect(screen.getByText("••••••••5678")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "QR สำหรับรับเงิน" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "แสดง QR สำหรับโอน" }));

    expect(screen.getByRole("img", { name: "QR สำหรับรับเงิน" })).toBeTruthy();
  });

  it("allows the bill owner to see payment details they hid from share viewers", () => {
    const privateDocument = {
      ...document,
      recipient: { ...document.recipient, visible: false },
    };

    render(<PaymentSummary document={privateDocument} token="edit-key" qrAvailable canManage />);

    expect(screen.getByText("โอนคืนให้ มิน")).toBeTruthy();
    expect(screen.getByText("••••••••7890")).toBeTruthy();
    expect(screen.getByRole("button", { name: "แสดง QR สำหรับโอน" })).toBeTruthy();
  });
});
