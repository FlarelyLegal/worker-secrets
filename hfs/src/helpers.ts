import { createInterface } from "node:readline";
import chalk from "chalk";
import type { SecretEntry } from "./client.js";
import { VaultClient } from "./client.js";
import { resolveAuth } from "./config.js";

export function client(): VaultClient {
  const auth = resolveAuth();
  return new VaultClient(auth);
}

export function die(msg: string): never {
  console.error(chalk.red(`error: ${msg}`));
  process.exit(1);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for stdin input")), 30000);
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(timeout);
      resolve(data);
    });
    process.stdin.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

export async function fetchAllSecrets(
  c: VaultClient,
  opts?: { search?: string },
): Promise<SecretEntry[]> {
  let all: SecretEntry[] = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const page = await c.list({ limit: pageSize, offset, search: opts?.search });
    all = all.concat(page.secrets);
    if (all.length >= page.total) break;
    offset += pageSize;
  }
  return all;
}

/** Parse comma-separated tag string into trimmed non-empty array. */
export function parseTags(tags: string): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function toShellLine(key: string, value: string, exportPrefix: boolean): string {
  const varName = key.replace(/[^a-zA-Z0-9_]/g, "_");
  const escaped = value.replace(/'/g, "'\\''");
  return `${exportPrefix ? "export " : ""}${varName}='${escaped}'\n`;
}

export function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(chalk.dim("Non-interactive mode detected, use --force to skip confirmation"));
    return Promise.resolve(false);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
