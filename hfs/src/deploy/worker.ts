import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { WORKER_DIR } from "./state.js";

// --- Secrets ---

export function checkSecretExists(): boolean {
  try {
    const output = execFileSync("npx", ["wrangler", "secret", "list", "--format", "json"], {
      cwd: WORKER_DIR,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const secrets = JSON.parse(output) as { name: string }[];
    return secrets.some((s) => s.name === "ENCRYPTION_KEY");
  } catch {
    return false;
  }
}

export function setEncryptionKey(): string {
  const key = randomBytes(32).toString("hex");
  execFileSync("npx", ["wrangler", "secret", "put", "ENCRYPTION_KEY"], {
    cwd: WORKER_DIR,
    input: `${key}\n`,
    stdio: ["pipe", "ignore", "inherit"],
  });
  return key;
}

// --- Migrations ---

export function listPendingMigrations(dbName: string): string[] {
  try {
    const output = execFileSync(
      "npx",
      ["wrangler", "d1", "migrations", "list", dbName, "--remote"],
      { cwd: WORKER_DIR, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const pending: string[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/│\s+(\d{4}_\S+)\s+│/);
      if (match) pending.push(match[1]);
    }
    return pending;
  } catch {
    return ["(unable to check — database may not exist yet)"];
  }
}

export function applyMigrations(dbName: string): void {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", dbName, "--remote"], {
    cwd: WORKER_DIR,
    stdio: ["ignore", "pipe", "inherit"],
    input: "y\n",
  });
}

// --- Deploy ---

export function deployWorker(): void {
  execFileSync("npx", ["wrangler", "deploy"], { cwd: WORKER_DIR, stdio: "inherit" });
}

export function dryRunDeploy(): void {
  execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", ".dry-run-out"], {
    cwd: WORKER_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  });
}
