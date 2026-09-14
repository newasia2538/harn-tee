import { describe, expect, it } from "vitest";
import {
  createOpaqueToken,
  hashToken,
  tokensMatch,
} from "../../lib/harn-tee/tokens";

describe("harn-tee bearer tokens", () => {
  it("creates distinct opaque tokens and hashes them before persistence", async () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(await hashToken(first)).not.toContain(first);
  });

  it("matches a raw token only against its own stored digest", async () => {
    const raw = createOpaqueToken();
    const digest = await hashToken(raw);

    await expect(tokensMatch(raw, digest)).resolves.toBe(true);
    await expect(tokensMatch("wrong-token", digest)).resolves.toBe(false);
  });
});
