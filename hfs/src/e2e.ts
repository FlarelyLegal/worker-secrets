import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { armor, Decrypter, Encrypter, generateIdentity, identityToRecipient } from "age-encryption";
import { getConfigPath } from "./config.js";

const E2E_TAG = "e2e";

/** Path to the default identity file (next to config.json). */
export function identityFilePath(): string {
  return join(dirname(getConfigPath()), "identity.txt");
}

/** Generate a new age identity and save to the default path. Returns { identity, recipient }. */
export async function generateKeypair(): Promise<{ identity: string; recipient: string }> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);

  const path = identityFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `# created: ${new Date().toISOString()}\n# public key: ${recipient}\n${identity}\n`,
    { mode: 0o600 },
  );

  return { identity, recipient };
}

/** Load the identity string from a file path. Strips comments and whitespace. */
export function loadIdentity(path?: string): string {
  const file = path || identityFilePath();
  if (!existsSync(file)) {
    throw new Error(`Identity file not found: ${file}\nRun \`hfs keygen\` to generate one.`);
  }
  const lines = readFileSync(file, "utf-8").split("\n");
  const key = lines.find((l) => l.startsWith("AGE-SECRET-KEY-"));
  if (!key) {
    throw new Error(`No age identity found in ${file}`);
  }
  return key.trim();
}

/** Load the recipient (public key) from the identity file. */
export async function loadRecipient(identityPath?: string): Promise<string> {
  const identity = loadIdentity(identityPath);
  return identityToRecipient(identity);
}

/** Load recipients from a file (one age1... or ssh-ed25519 per line). */
export function loadRecipients(recipientsPath: string): string[] {
  const lines = readFileSync(recipientsPath, "utf-8").split("\n");
  return lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

/** Encrypt plaintext for one or more recipients. Returns armored age ciphertext. */
export async function e2eEncrypt(plaintext: string, recipients: string[]): Promise<string> {
  if (recipients.length === 0) throw new Error("No recipients specified for e2e encryption");
  const e = new Encrypter();
  for (const r of recipients) e.addRecipient(r);
  const ciphertext = await e.encrypt(plaintext);
  return armor.encode(ciphertext);
}

/** Decrypt armored age ciphertext using the local identity. Returns plaintext. */
export async function e2eDecrypt(
  armoredCiphertext: string,
  identityPath?: string,
): Promise<string> {
  const identity = loadIdentity(identityPath);
  const ciphertext = armor.decode(armoredCiphertext);
  const d = new Decrypter();
  d.addIdentity(identity);
  return d.decrypt(ciphertext, "text");
}

/** Check if a secret's tags indicate it's e2e encrypted. */
export function isE2E(tags: string): boolean {
  if (!tags) return false;
  return tags.split(",").some((t) => t.trim() === E2E_TAG);
}

/** Ensure the e2e tag is present in a tags string. */
export function ensureE2ETag(tags: string): string {
  if (isE2E(tags)) return tags;
  return tags ? `${tags},${E2E_TAG}` : E2E_TAG;
}
