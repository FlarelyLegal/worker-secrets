import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../crypto.js";

const VALID_KEY = "aa".repeat(32); // 64 hex chars = 32 bytes

describe("crypto", () => {
  it("encrypt then decrypt round-trip produces original plaintext", async () => {
    const plaintext = "super-secret-value";
    const { ciphertext, iv } = await encrypt(plaintext, VALID_KEY);
    const result = await decrypt(ciphertext, iv, VALID_KEY);
    expect(result).toBe(plaintext);
  });

  it("produces different IVs for same plaintext (non-deterministic)", async () => {
    const plaintext = "same-value";
    const a = await encrypt(plaintext, VALID_KEY);
    const b = await encrypt(plaintext, VALID_KEY);
    expect(a.iv).not.toBe(b.iv);
  });

  it("wrong key fails to decrypt", async () => {
    const { ciphertext, iv } = await encrypt("secret", VALID_KEY);
    const wrongKey = "bb".repeat(32);
    await expect(decrypt(ciphertext, iv, wrongKey)).rejects.toThrow();
  });

  it("empty string round-trip works", async () => {
    const { ciphertext, iv } = await encrypt("", VALID_KEY);
    const result = await decrypt(ciphertext, iv, VALID_KEY);
    expect(result).toBe("");
  });

  it("unicode and emoji round-trip works", async () => {
    const plaintext = "Hello, world! Bonjour le monde! \u{1F510}\u{1F30D}";
    const { ciphertext, iv } = await encrypt(plaintext, VALID_KEY);
    const result = await decrypt(ciphertext, iv, VALID_KEY);
    expect(result).toBe(plaintext);
  });

  it("invalid hex key (non-hex chars) throws with correct message", async () => {
    const badKey = "zz".repeat(32);
    await expect(encrypt("test", badKey)).rejects.toThrow(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  });

  it("wrong length hex key throws", async () => {
    const shortKey = "aa".repeat(16); // 32 hex chars, too short
    await expect(encrypt("test", shortKey)).rejects.toThrow(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  });
});
