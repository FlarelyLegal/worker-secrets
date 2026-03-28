// Copies secret-vault source into dist/worker/ for bundled deployment
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "secret-vault");
const dest = join(root, "dist", "worker");

rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, "src", "routes"), { recursive: true });
mkdirSync(join(dest, "migrations"), { recursive: true });

// Worker source
cpSync(join(src, "src"), join(dest, "src"), { recursive: true });

// Migrations
cpSync(join(src, "migrations"), join(dest, "migrations"), { recursive: true });

// Config files
cpSync(join(src, "package.json"), join(dest, "package.json"));
cpSync(join(src, "tsconfig.json"), join(dest, "tsconfig.json"));

console.log("✓ Worker source bundled into dist/worker/");
