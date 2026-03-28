let _cachedKey: CryptoKey | null = null;
let _cachedKeyHex = "";

async function getKey(hexKey: string): Promise<CryptoKey> {
  if (_cachedKey && _cachedKeyHex === hexKey) return _cachedKey;
  const raw = hexToBytes(hexKey);
  _cachedKey = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  _cachedKeyHex = hexKey;
  return _cachedKey;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encrypt(
  plaintext: string,
  hexKey: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: toBase64(encrypted), iv: toBase64(iv) };
}

export async function decrypt(ciphertext: string, ivB64: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = fromBase64(ivB64);
  const data = fromBase64(ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
