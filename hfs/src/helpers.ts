import { createInterface } from "node:readline";
import chalk from "chalk";
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
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
