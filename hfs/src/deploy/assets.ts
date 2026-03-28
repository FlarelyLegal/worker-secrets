import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeployState } from "./state.js";
import { WORKER_DIR } from "./state.js";

export function copyWorkerSource(): void {
  const bundled = new URL("../worker", import.meta.url);
  if (!existsSync(bundled.pathname)) {
    throw new Error("Bundled worker source not found. Rebuild with `npm run build`.");
  }
  // Clean src + migrations to avoid stale files, preserve node_modules + state
  for (const dir of ["src", "migrations"]) {
    rmSync(join(WORKER_DIR, dir), { recursive: true, force: true });
  }
  mkdirSync(WORKER_DIR, { recursive: true });
  cpSync(bundled.pathname, WORKER_DIR, { recursive: true, force: true });
}

export function installDeps(): void {
  if (existsSync(join(WORKER_DIR, "node_modules", "wrangler"))) return;
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: WORKER_DIR,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

export function checkWrangler(): void {
  try {
    execFileSync("npx", ["wrangler", "--version"], { cwd: WORKER_DIR, stdio: "ignore" });
  } catch {
    throw new Error("wrangler not available. Run `npm install` in the worker directory first.");
  }
}

// --- D1 ---

export function checkD1Exists(dbName: string): string | null {
  try {
    const output = execFileSync("npx", ["wrangler", "d1", "list", "--json"], {
      cwd: WORKER_DIR,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const dbs = JSON.parse(output) as { name: string; uuid: string }[];
    return dbs.find((db) => db.name === dbName)?.uuid ?? null;
  } catch {
    return null;
  }
}

export function createD1(dbName: string): string {
  const output = execFileSync("npx", ["wrangler", "d1", "create", dbName], {
    cwd: WORKER_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const match = output.match(/database_id["\s:=]+([0-9a-f-]{36})/);
  if (!match) throw new Error(`Could not parse database ID from output:\n${output}`);
  return match[1];
}

// --- Wrangler config ---

export function writeWranglerConfig(state: DeployState): void {
  const dbName = `${state.projectName}-db`;
  const cfg: Record<string, unknown> = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: state.projectName,
    account_id: state.accountId,
    main: "src/index.ts",
    compatibility_date: "2026-03-28",
    compatibility_flags: ["nodejs_compat"],
    routes: (state.domains.length > 0 ? state.domains : [state.domain]).map((d) => ({
      pattern: d,
      custom_domain: true,
    })),
    d1_databases: [
      {
        binding: "DB",
        database_name: dbName,
        database_id: state.databaseId || "placeholder",
      },
    ],
    vars: {
      ALLOWED_EMAILS: state.emails,
      TEAM_DOMAIN: state.teamDomain,
      POLICY_AUD: state.policyAud,
      PROJECT_NAME: state.projectName,
      BRAND_NAME: state.brandName,
    },
  };
  if (state.workersDev) cfg.workers_dev = true;
  if (state.observability) {
    cfg.observability = {
      enabled: false,
      head_sampling_rate: 1,
      logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true },
    };
  }
  writeFileSync(join(WORKER_DIR, "wrangler.jsonc"), JSON.stringify(cfg, null, 2));
}
