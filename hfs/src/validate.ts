/** Validate a secret key name. Returns error message or null if valid. */
export function validateSecretKey(key: string): string | null {
  if (!key) return "Key name is required";
  if (key.length > 256) return "Key name exceeds 256 characters";
  if (/\s/.test(key)) return "Key name cannot contain whitespace";
  if (!/^[\x21-\x7e]+$/.test(key)) return "Key name must be printable ASCII (no spaces)";
  return null;
}

/** Validate an email address (basic RFC pattern). */
export function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  return null;
}

/** Validate comma-separated tags. */
export function validateTags(tags: string): string | null {
  if (!tags) return null; // tags are optional
  const parts = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of parts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(t))
      return `Invalid tag '${t}' - use letters, digits, dashes, underscores`;
  }
  return null;
}

/** Validate an ISO date string or common date format. */
export function validateDate(date: string): string | null {
  if (!date) return "Date is required";
  const ts = Date.parse(date);
  if (Number.isNaN(ts)) return `Invalid date '${date}' - use ISO 8601 (e.g. 2026-12-31)`;
  if (ts < Date.now()) return `Date '${date}' is in the past`;
  return null;
}

/** Validate an age public key. */
export function validateAgeKey(key: string): string | null {
  if (!key) return "Age public key is required";
  if (!key.startsWith("age1")) return "Age public key must start with 'age1'";
  if (key.length < 50) return "Age public key is too short";
  return null;
}
