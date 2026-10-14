import { describe, expect, it } from "vitest";
import {
  readJsonBody,
  RequestBodyTooLargeError,
} from "../../lib/harn-tee/request-body";

describe("bounded request parsing", () => {
  it("parses JSON within the configured byte limit", async () => {
    const request = new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: true });
  });

  it("rejects an oversized body even when its length is not declared", async () => {
    const request = new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(5));
          controller.enqueue(new Uint8Array(5));
          controller.close();
        },
      }),
    } as RequestInit & { duplex: "half" });

    await expect(readJsonBody(request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("rejects malformed JSON as a client input error", async () => {
    const request = new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      body: "{bad json",
    });

    await expect(readJsonBody(request, 64)).rejects.toMatchObject({ name: "InvalidJsonBodyError" });
  });
});
