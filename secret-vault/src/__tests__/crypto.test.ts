import { describe, expect, it } from "vitest";
import {
  computeHmac,
  decrypt,
  decryptSecretRow,
  type EncryptedRow,
  encrypt,
  encryptSecretValue,
  envelopeEncrypt,
} from "../crypto.js";
import { EncryptionError } from "../errors.js";

const VALID_KEY = "aa".repeat(32); // 64 hex chars = 32 bytes
const INTEGRITY_KEY = "bb".repeat(32); // separate HMAC key

describe("crypto", () => {
  it("encrypt then decrypt round-trip produces original plaintext", async () => {
    const plaintext = "super-secret-value";
    const { ciphertext, iv } = await encrypt(plaintext, VALID_KEY, "test-key");
    const result = await decrypt(ciphertext, iv, VALID_KEY, "test-key");
    expect(result).toBe(plaintext);
  });

  it("produces different IVs for same plaintext (non-deterministic)", async () => {
    const plaintext = "same-value";
    const a = await encrypt(plaintext, VALID_KEY, "key-a");
    const b = await encrypt(plaintext, VALID_KEY, "key-b");
    expect(a.iv).not.toBe(b.iv);
  });

  it("wrong key fails to decrypt", async () => {
    const { ciphertext, iv } = await encrypt("secret", VALID_KEY, "test-key");
    const wrongKey = "bb".repeat(32);
    await expect(decrypt(ciphertext, iv, wrongKey, "test-key")).rejects.toThrow();
  });

  it("empty string round-trip works", async () => {
    const { ciphertext, iv } = await encrypt("", VALID_KEY, "test-key");
    const result = await decrypt(ciphertext, iv, VALID_KEY, "test-key");
    expect(result).toBe("");
  });

  it("unicode and emoji round-trip works", async () => {
    const plaintext = "Hello, world! Bonjour le monde! \u{1F510}\u{1F30D}";
    const { ciphertext, iv } = await encrypt(plaintext, VALID_KEY, "test-key");
    const result = await decrypt(ciphertext, iv, VALID_KEY, "test-key");
    expect(result).toBe(plaintext);
  });

  it("wrong AAD (key name) fails to decrypt", async () => {
    const { ciphertext, iv } = await encrypt("secret", VALID_KEY, "original-key");
    await expect(decrypt(ciphertext, iv, VALID_KEY, "different-key")).rejects.toThrow();
  });

  it("invalid hex key (non-hex chars) throws with correct message", async () => {
    const badKey = "zz".repeat(32);
    await expect(encrypt("test", badKey, "k")).rejects.toThrow(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  });

  it("wrong length hex key throws", async () => {
    const shortKey = "aa".repeat(16); // 32 hex chars, too short
    await expect(encrypt("test", shortKey, "k")).rejects.toThrow(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  });
});

describe("decryptSecretRow", () => {
  it("decrypts envelope-encrypted data with valid HMAC", async () => {
    const plaintext = "my-secret-value";
    const keyName = "test-key";
    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      VALID_KEY,
      keyName,
    );
    const hmac = await computeHmac(
      keyName,
      ciphertext,
      iv,
      VALID_KEY,
      INTEGRITY_KEY,
      encrypted_dek,
      dek_iv,
    );
    const row: EncryptedRow = {
      value: ciphertext,
      iv,
      encrypted_dek,
      dek_iv,
      hmac,
    };
    const result = await decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, {
      hmacRequired: false,
    });
    expect(result).toBe(plaintext);
  });

  it("throws EncryptionError on bad HMAC", async () => {
    const plaintext = "my-secret-value";
    const keyName = "test-key";
    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      VALID_KEY,
      keyName,
    );
    const row: EncryptedRow = {
      value: ciphertext,
      iv,
      encrypted_dek,
      dek_iv,
      hmac: "dGFtcGVyZWQ", // invalid HMAC
    };
    await expect(
      decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, { hmacRequired: false }),
    ).rejects.toThrow(EncryptionError);
    await expect(
      decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, { hmacRequired: false }),
    ).rejects.toThrow("Integrity check failed");
  });

  it("throws EncryptionError when hmacRequired=true and no HMAC present", async () => {
    const plaintext = "my-secret-value";
    const keyName = "test-key";
    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      VALID_KEY,
      keyName,
    );
    const row: EncryptedRow = {
      value: ciphertext,
      iv,
      encrypted_dek,
      dek_iv,
      hmac: null,
    };
    await expect(
      decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, { hmacRequired: true }),
    ).rejects.toThrow(EncryptionError);
    await expect(
      decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, { hmacRequired: true }),
    ).rejects.toThrow("Secret missing HMAC integrity tag - re-save to add one");
  });

  it("decrypts legacy (non-envelope) data without HMAC", async () => {
    const plaintext = "legacy-secret";
    const keyName = "legacy-key";
    const { ciphertext, iv } = await encrypt(plaintext, VALID_KEY, keyName);
    const row: EncryptedRow = {
      value: ciphertext,
      iv,
      encrypted_dek: null,
      dek_iv: null,
      hmac: null,
    };
    const result = await decryptSecretRow(row, VALID_KEY, keyName, undefined, {
      hmacRequired: false,
    });
    expect(result).toBe(plaintext);
  });

  it("decrypts envelope data without HMAC when hmacRequired=false", async () => {
    const plaintext = "no-hmac-envelope";
    const keyName = "test-key";
    const { ciphertext, iv, encrypted_dek, dek_iv } = await envelopeEncrypt(
      plaintext,
      VALID_KEY,
      keyName,
    );
    const row: EncryptedRow = {
      value: ciphertext,
      iv,
      encrypted_dek,
      dek_iv,
      hmac: null,
    };
    const result = await decryptSecretRow(row, VALID_KEY, keyName, undefined, {
      hmacRequired: false,
    });
    expect(result).toBe(plaintext);
  });
});

describe("encryptSecretValue", () => {
  it("produces all required fields and round-trips correctly", async () => {
    const plaintext = "encrypt-me";
    const keyName = "my-key";
    const result = await encryptSecretValue(plaintext, VALID_KEY, keyName, INTEGRITY_KEY);

    expect(result).toHaveProperty("ciphertext");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("encrypted_dek");
    expect(result).toHaveProperty("dek_iv");
    expect(result).toHaveProperty("hmac");

    // All fields should be non-empty strings
    expect(result.ciphertext.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
    expect(result.encrypted_dek.length).toBeGreaterThan(0);
    expect(result.dek_iv.length).toBeGreaterThan(0);
    expect(result.hmac.length).toBeGreaterThan(0);

    // Should round-trip via decryptSecretRow
    const row: EncryptedRow = {
      value: result.ciphertext,
      iv: result.iv,
      encrypted_dek: result.encrypted_dek,
      dek_iv: result.dek_iv,
      hmac: result.hmac,
    };
    const decrypted = await decryptSecretRow(row, VALID_KEY, keyName, INTEGRITY_KEY, {
      hmacRequired: true,
    });
    expect(decrypted).toBe(plaintext);
  });

  it("works without separate integrity key (HKDF-derived)", async () => {
    const plaintext = "no-integrity-key";
    const keyName = "test-key";
    const result = await encryptSecretValue(plaintext, VALID_KEY, keyName);

    const row: EncryptedRow = {
      value: result.ciphertext,
      iv: result.iv,
      encrypted_dek: result.encrypted_dek,
      dek_iv: result.dek_iv,
      hmac: result.hmac,
    };
    const decrypted = await decryptSecretRow(row, VALID_KEY, keyName, undefined, {
      hmacRequired: true,
    });
    expect(decrypted).toBe(plaintext);
  });
});
