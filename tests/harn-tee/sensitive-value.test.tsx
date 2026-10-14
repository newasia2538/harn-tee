// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SensitiveValue } from "../../components/harn-tee/sensitive-value";

const secret = "1234567890";
const masked = "••••••••7890";
const writeText = vi.fn(async () => undefined);
const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ value: secret }),
}));

beforeEach(() => {
  fetchMock.mockClear();
  writeText.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SensitiveValue", () => {
  it("starts masked and fetches the plaintext only when the user reveals it", async () => {
    render(
      <SensitiveValue
        token="share-key"
        field="bank"
        value={secret}
        label="เลขบัญชี"
      />,
    );

    expect(screen.getByText(masked)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "แสดงเลขบัญชี" }));

    expect(await screen.findByText(secret)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bills/share-key/payment-details?field=bank",
      { cache: "no-store" },
    );
  });

  it("copies the real value without unmasking it on screen", async () => {
    render(
      <SensitiveValue
        token="share-key"
        field="bank"
        value={secret}
        label="เลขบัญชี"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "คัดลอกเลขบัญชี" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(secret));
    expect(screen.getByText(masked)).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "แสดงเลขบัญชี" }));
    expect(await screen.findByText(secret)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the plaintext from the rendered value when hidden again", async () => {
    render(
      <SensitiveValue
        token="share-key"
        field="bank"
        value={secret}
        label="เลขบัญชี"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "แสดงเลขบัญชี" }));
    expect(await screen.findByText(secret)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนเลขบัญชี" }));

    expect(screen.getByText(masked)).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
  });
});
