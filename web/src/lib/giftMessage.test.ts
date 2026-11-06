import { describe, expect, it } from "vitest";
import { hexlify, randomBytes } from "ethers";
import { openMessage, sealedMessagePattern, sealMessage } from "./giftMessage";
import { MESSAGE_MAX } from "./designs";

describe("sealed recipient notes", () => {
  const secret = hexlify(randomBytes(32));
  it("round-trips unicode notes with the envelope secret only", async () => {
    const sealed = await sealMessage(secret, "  शुभ दीपावली, Priya 🪔  ");
    expect(sealed).toMatch(sealedMessagePattern);
    expect(sealed).not.toContain("Priya");
    expect(await openMessage(secret, sealed!)).toBe("शुभ दीपावली, Priya 🪔");
    expect(await openMessage(hexlify(randomBytes(32)), sealed!)).toBeNull();
  });
  it("uses a fresh IV, skips empty notes and enforces the length limit", async () => {
    expect(await sealMessage(secret, "Hi")).not.toBe(await sealMessage(secret, "Hi"));
    expect(await sealMessage(secret, "   ")).toBeNull();
    await expect(sealMessage(secret, "x".repeat(MESSAGE_MAX + 1))).rejects.toThrow();
    const longest = await sealMessage(secret, "🪔".repeat(MESSAGE_MAX / 2));
    expect(longest).toMatch(sealedMessagePattern);
    expect(await openMessage(secret, "v1.not-a-real.payload")).toBeNull();
  });
});
