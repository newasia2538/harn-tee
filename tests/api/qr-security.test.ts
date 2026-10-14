import { describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  readBillByToken: vi.fn(),
  readQrByToken: vi.fn(),
  saveQrForEditToken: vi.fn(),
}));

vi.mock("../../db/repository", () => repository);

import { GET, POST } from "../../app/api/bills/[token]/qr/route";

describe("QR endpoint security", () => {
  it("serves QR images without public caching", async () => {
    repository.readQrByToken.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      httpMetadata: { contentType: "image/png" },
      httpEtag: '"qr-etag"',
    });

    const response = await GET(new Request("https://harn-tee.test/api/bills/share-key/qr"), {
      params: Promise.resolve({ token: "share-key" }),
    });

    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Cache-Control")).not.toContain("public");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("checks the edit capability before reading an upload body", async () => {
    repository.readBillByToken.mockResolvedValue(null);
    const request = new Request("https://harn-tee.test/api/bills/not-a-token/qr", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "this is not multipart data",
    });

    const response = await POST(request, {
      params: Promise.resolve({ token: "not-a-token" }),
    });

    expect(response.status).toBe(404);
    expect(repository.saveQrForEditToken).not.toHaveBeenCalled();
  });

  it("rejects image uploads whose bytes do not match the declared file type", async () => {
    repository.readBillByToken.mockResolvedValue({ id: "bill-1", document: { status: "draft" }, access: "edit" });
    repository.saveQrForEditToken.mockClear();
    const form = new FormData();
    form.append("file", new File([new Uint8Array([60, 115, 118, 103])], "fake.png", { type: "image/png" }));

    const response = await POST(new Request("https://harn-tee.test/api/bills/edit-key/qr", {
      method: "POST",
      body: form,
    }), { params: Promise.resolve({ token: "edit-key" }) });

    expect(response.status).toBe(400);
    expect(repository.saveQrForEditToken).not.toHaveBeenCalled();
  });

  it("accepts a bounded PNG upload from a valid edit token", async () => {
    repository.readBillByToken.mockResolvedValue({ id: "bill-1", document: { status: "draft" }, access: "edit" });
    repository.saveQrForEditToken.mockResolvedValue({ status: "draft" });
    const form = new FormData();
    form.append("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "qr.png", { type: "image/png" }));

    const response = await POST(new Request("https://harn-tee.test/api/bills/edit-key/qr", {
      method: "POST",
      body: form,
    }), { params: Promise.resolve({ token: "edit-key" }) });

    expect(response.status).toBe(200);
    expect(repository.saveQrForEditToken).toHaveBeenCalledOnce();
  });
});
