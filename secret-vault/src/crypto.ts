// --- Key caching ---

let _cachedKey: CryptoKey | null = null;
let _cachedKeyHex = "";
let _cachedHmacKey: CryptoKey | null = null;

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
  _cachedHmacKey = null; // invalidate HMAC key when encryption key changes
  return _cachedKey;
}

async function getHmacKey(hexKey: string): Promise<CryptoKey> {
  if (_cachedHmacKey && _cachedKeyHex === hexKey) return _cachedHmacKey;
  // Derive a separate HMAC key from the encryption key using HKDF
  const raw = hexToBytes(hexKey);
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
  // Accepts both base64url and standard base64 (backwards compatible)
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(standard), (c) => c.charCodeAt(0));
}

// --- Encrypt / Decrypt ---

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
// Binds ciphertext to its key name, preventing swap attacks on D1.

export async function computeHmac(
  secretKey: string,
  ciphertext: string,
  iv: string,
  hexKey: string,
): Promise<string> {
  const hmacKey = await getHmacKey(hexKey);
  const data = new TextEncoder().encode(`${secretKey}:${ciphertext}:${iv}`);
  const sig = await crypto.subtle.sign("HMAC", hmacKey, data);
  return toBase64url(sig);
}

export async function verifyHmac(
  secretKey: string,
  ciphertext: string,
  iv: string,
  hmac: string,
  hexKey: string,
): Promise<boolean> {
  const hmacKey = await getHmacKey(hexKey);
  const data = new TextEncoder().encode(`${secretKey}:${ciphertext}:${iv}`);
  const sig = fromBase64url(hmac);
  return crypto.subtle.verify("HMAC", hmacKey, sig, data);
}
