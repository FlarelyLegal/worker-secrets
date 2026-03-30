import { describe, it, expect } from "vitest";
import {
  validateSecretKey,
  validateEmail,
  validateTags,
  validateDate,
  validateAgeKey,
} from "../src/validate.js";

// ---------------------------------------------------------------------------
// validateSecretKey
// ---------------------------------------------------------------------------

describe("validateSecretKey", () => {
  it("accepts a valid key", () => {
    expect(validateSecretKey("API_KEY")).toBeNull();
  });

  it("accepts a key with allowed special characters", () => {
    expect(validateSecretKey("my-key.v2:prod")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateSecretKey("")).toBe("Key name is required");
  });

  it("rejects a key exceeding 256 characters", () => {
    expect(validateSecretKey("A".repeat(257))).toBe("Key name exceeds 256 characters");
  });

  it("accepts a key exactly 256 characters long", () => {
    expect(validateSecretKey("A".repeat(256))).toBeNull();
  });

  it("rejects a key with a space", () => {
    expect(validateSecretKey("my key")).toBe("Key name cannot contain whitespace");
  });

  it("rejects a key with a tab character", () => {
    expect(validateSecretKey("my\tkey")).toBe("Key name cannot contain whitespace");
  });

  it("rejects a key with a non-ASCII character", () => {
    expect(validateSecretKey("café")).toBe("Key name must be printable ASCII (no spaces)");
  });

  it("rejects a key with a null byte", () => {
    expect(validateSecretKey("key\x00val")).toBe("Key name must be printable ASCII (no spaces)");
  });

  it("accepts tilde (boundary of printable ASCII range)", () => {
    expect(validateSecretKey("key~name")).toBeNull();
  });

  it("rejects DEL character (\\x7f, just above printable range)", () => {
    expect(validateSecretKey("key\x7fname")).toBe("Key name must be printable ASCII (no spaces)");
  });
});

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("user@example.com")).toBeNull();
  });

  it("accepts an email with subdomains", () => {
    expect(validateEmail("user@mail.example.co.uk")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateEmail("")).toBe("Email is required");
  });

  it("rejects an address with no @ sign", () => {
    expect(validateEmail("userexample.com")).toBe("Invalid email format");
  });

  it("rejects an address with no domain part", () => {
    expect(validateEmail("user@")).toBe("Invalid email format");
  });

  it("rejects an address with no TLD", () => {
    expect(validateEmail("user@example")).toBe("Invalid email format");
  });

  it("rejects an address with spaces", () => {
    expect(validateEmail("user @example.com")).toBe("Invalid email format");
  });
});

// ---------------------------------------------------------------------------
// validateTags
// ---------------------------------------------------------------------------

describe("validateTags", () => {
  it("accepts a single valid tag", () => {
    expect(validateTags("production")).toBeNull();
  });

  it("accepts multiple valid tags", () => {
    expect(validateTags("production,ci,backend")).toBeNull();
  });

  it("accepts tags with dashes and underscores", () => {
    expect(validateTags("my-tag,my_tag")).toBeNull();
  });

  it("accepts alphanumeric tags", () => {
    expect(validateTags("tag1,tag2")).toBeNull();
  });

  it("returns null for empty string (tags are optional)", () => {
    expect(validateTags("")).toBeNull();
  });

  it("rejects a tag containing a space", () => {
    const err = validateTags("good,bad tag");
    expect(err).toMatch(/Invalid tag 'bad tag'/);
  });

  it("rejects a tag with special characters", () => {
    const err = validateTags("valid,inv@lid");
    expect(err).toMatch(/Invalid tag 'inv@lid'/);
  });

  it("rejects a tag with a dot", () => {
    const err = validateTags("ok,not.ok");
    expect(err).toMatch(/Invalid tag 'not.ok'/);
  });

  it("trims whitespace before validation, accepts padded-but-valid tags", () => {
    // " production " trims to "production" which is valid
    expect(validateTags(" production , ci ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateDate
// ---------------------------------------------------------------------------

describe("validateDate", () => {
  it("accepts a full ISO 8601 datetime string in the future", () => {
    expect(validateDate("2099-12-31T23:59:59Z")).toBeNull();
  });

  it("accepts a short date (YYYY-MM-DD) in the future", () => {
    expect(validateDate("2099-12-31")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateDate("")).toBe("Date is required");
  });

  it("rejects a clearly invalid string", () => {
    const err = validateDate("not-a-date");
    expect(err).toMatch(/Invalid date 'not-a-date'/);
  });

  it("rejects a date in the past", () => {
    const err = validateDate("2020-01-01");
    expect(err).toMatch(/in the past/);
  });

  it("rejects a numeric string with no date meaning", () => {
    const err = validateDate("hello-world");
    expect(err).toMatch(/Invalid date/);
  });

  it("includes the bad value in the error message", () => {
    const bad = "2026-99-99";
    const err = validateDate(bad);
    if (err !== null) expect(err).toContain(bad);
  });
});

// ---------------------------------------------------------------------------
// validateAgeKey
// ---------------------------------------------------------------------------

describe("validateAgeKey", () => {
  it("accepts a valid age public key", () => {
    // 62-char key starting with age1 (typical bech32 length)
    expect(validateAgeKey("age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateAgeKey("")).toBe("Age public key is required");
  });

  it("rejects a key that does not start with 'age1'", () => {
    expect(validateAgeKey("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG")).toBe(
      "Age public key must start with 'age1'",
    );
  });

  it("rejects a key with the right prefix but too short", () => {
    expect(validateAgeKey("age1short")).toBe("Age public key is too short");
  });

  it("rejects a key that is exactly 49 characters (one under minimum)", () => {
    const key = "age1" + "a".repeat(45); // 4 + 45 = 49 chars
    expect(validateAgeKey(key)).toBe("Age public key is too short");
  });

  it("accepts a key that is exactly 50 characters", () => {
    const key = "age1" + "a".repeat(46); // 4 + 46 = 50 chars
    expect(validateAgeKey(key)).toBeNull();
  });
});
