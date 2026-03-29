// --- Key caching ---

let _cachedKey: CryptoKey | null = null;
let _cachedKeyHex = "";
let _cachedHmacKey: CryptoKey | null = null;
let _cachedHmacKeySource = "";

async function getKey(hexKey: string): Promise<CryptoKey> {
  if (_cachedKey && _cachedKeyHex === hexKey) return _cachedKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
  }
  const raw = hexToBytes(hexKey);
  _cachedKey = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  _cachedKeyHex = hexKey;
  _cachedHmacKey = null;
  return _cachedKey;
}

/**
 * Get HMAC key. If a separate INTEGRITY_KEY is provided, use it directly.
 * Otherwise, derive from ENCRYPTION_KEY via HKDF (backwards compatible).
 */
async function getHmacKey(encryptionKey: string, integrityKey?: string): Promise<CryptoKey> {
  const source = integrityKey || encryptionKey;
  if (_cachedHmacKey && _cachedHmacKeySource === source) return _cachedHmacKey;

  if (integrityKey) {
    // Separate integrity key — use directly
    const raw = hexToBytes(integrityKey);
    _cachedHmacKey = await crypto.subtle.importKey(
      "raw",
      raw.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  } else {
    // Derive from encryption key via HKDF
    const raw = hexToBytes(encryptionKey);
    const baseKey = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, "HKDF", false, [
      "deriveKey",
    ]);
    _cachedHmacKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode("hmac-integrity"),
      },
      baseKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  _cachedHmacKeySource = source;
  return _cachedHmacKey;
}

// --- Encoding helpers ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(b64: string): Uint8Array {
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(standard), (c) => c.charCodeAt(0));
}

// --- Envelope encryption ---
// Generates a random DEK, encrypts data with DEK, encrypts DEK with master KEK.

export async function envelopeEncrypt(
  plaintext: string,
  hexKey: string,
): Promise<{ ciphertext: string; iv: string; encrypted_dek: string; dek_iv: string }> {
  const kek = await getKey(hexKey);

  // Generate random DEK
  const dekRaw = crypto.getRandomValues(new Uint8Array(32));

  // Encrypt plaintext with DEK
  const dekCryptoKey = await crypto.subtle.importKey(
    "raw",
    dekRaw.buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: dataIv },
    dekCryptoKey,
    new TextEncoder().encode(plaintext),
  );

  // Encrypt DEK with KEK
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedDek = await crypto.subtle.encrypt({ name: "AES-GCM", iv: dekIv }, kek, dekRaw);

  return {
    ciphertext: toBase64url(encrypted),
    iv: toBase64url(dataIv),
    encrypted_dek: toBase64url(encryptedDek),
    dek_iv: toBase64url(dekIv),
  };
}

export async function envelopeDecrypt(
  ciphertext: string,
  ivB64: string,
  encryptedDekB64: string,
  dekIvB64: string,
  hexKey: string,
): Promise<string> {
  const kek = await getKey(hexKey);

  // Decrypt DEK with KEK
  const dekRaw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(dekIvB64) },
    kek,
    fromBase64url(encryptedDekB64),
  );

  // Decrypt data with DEK
  const dekCryptoKey = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(ivB64) },
    dekCryptoKey,
    fromBase64url(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

// --- Legacy direct encryption (backwards compatible) ---

export async function encrypt(
  plaintext: string,
  hexKey: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: toBase64url(encrypted), iv: toBase64url(iv) };
}

export async function decrypt(ciphertext: string, ivB64: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = fromBase64url(ivB64);
  const data = fromBase64url(ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// --- HMAC integrity ---

export async function computeHmac(
  secretKey: string,
  ciphertext: string,
  iv: string,
  hexKey: string,
  integrityKey?: string,
  encryptedDek?: string | null,
  dekIv?: string | null,
): Promise<string> {
  const hmacKey = await getHmacKey(hexKey, integrityKey);
  // Bind all encrypted fields — prevents DEK swap attacks
  const parts = [secretKey, ciphertext, iv];
  if (encryptedDek) parts.push(encryptedDek);
  if (dekIv) parts.push(dekIv);
  const data = new TextEncoder().encode(parts.join(":"));
  const sig = await crypto.subtle.sign("HMAC", hmacKey, data);
  return toBase64url(sig);
}

export async function verifyHmac(
  secretKey: string,
  ciphertext: string,
  iv: string,
  hmac: string,
  hexKey: string,
  integrityKey?: string,
  encryptedDek?: string | null,
  dekIv?: string | null,
): Promise<boolean> {
  const hmacKey = await getHmacKey(hexKey, integrityKey);
  const parts = [secretKey, ciphertext, iv];
  if (encryptedDek) parts.push(encryptedDek);
  if (dekIv) parts.push(dekIv);
  const data = new TextEncoder().encode(parts.join(":"));
  const sig = fromBase64url(hmac);
  return crypto.subtle.verify("HMAC", hmacKey, sig, data);
}
