import chalk from "chalk";
import { errorMessage } from "../helpers.js";
import {
  applyMigrations,
  checkD1Exists,
  checkSecretExists,
  createAccessApp,
  createD1,
  deployWorker,
  dryRunDeploy,
  findAccessApp,
  listPendingMigrations,
  resolveCfAuth,
  setEncryptionKey,
  updateAccessApp,
  writeWranglerConfig,
} from "./index.js";
import type { DeployState } from "./state.js";
import { saveState } from "./state.js";

function ok(msg: string, dry: boolean): void {
  console.log(`  ${dry ? chalk.yellow("○") : chalk.green("✓")} ${msg}`);
}

export function fail(phase: string, err: unknown): never {
  const msg = errorMessage(err);
  console.error(`\n  ${chalk.red("✗")} ${phase} failed: ${msg}`);
  console.error(
    chalk.dim("\n  Your progress is saved. Fix the issue and run `hfs deploy` to resume.\n"),
  );

  if (msg.includes("timed out") || msg.includes("fetch failed") || msg.includes("ETIMEDOUT")) {
    console.error(
      chalk.dim("  Hint: Check your internet connection. Try enabling Cloudflare WARP."),
    );
  } else if (msg.includes("API key") || msg.includes("email")) {
    console.error(chalk.dim("  Hint: Set CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL env vars."));
  } else if (msg.includes("not found") && msg.includes("database")) {
    console.error(
      chalk.dim("  Hint: The D1 database may have been deleted. Run `hfs deploy` to recreate."),
    );
  }

  console.error(chalk.dim("  Run `hfs deploy status` to see current state.\n"));
  process.exit(1);
}

// --- Phase 1: Access Application ---

export async function phaseAccess(state: DeployState, dry: boolean): Promise<void> {
  console.log(chalk.bold("\n  Phase 1: Access Application\n"));

  const domains = state.domains.length > 0 ? state.domains : [state.domain];

  try {
    const auth = resolveCfAuth();
    const existing = await findAccessApp(state.accountId, domains, auth);

    if (existing) {
      state.accessAppId = existing.id;
      state.policyAud = existing.aud;

      // Check if domains changed — sync protected paths
      const currentPaths = existing.self_hosted_domains?.sort().join(",") ?? "";
      const expectedPaths = domains
        .flatMap((d) => [`${d}/secrets`, `${d}/tokens`])
        .sort()
        .join(",");

      if (currentPaths !== expectedPaths && !dry) {
        await updateAccessApp(state.accountId, existing.id, domains, state.brandName, auth);
        ok(`App updated with ${domains.length} domain(s)`, dry);
      } else if (currentPaths !== expectedPaths) {
        console.log(`  ${chalk.yellow("⚠")} Domains changed — will sync on deploy`);
      } else {
        ok(`App exists ${chalk.dim(`(${existing.id.slice(0, 8)}...)`)}`, dry);
      }

      saveState(state);
      ok(`AUD: ${chalk.dim(state.policyAud.slice(0, 16))}...`, dry);
      for (const d of domains) console.log(chalk.dim(`    ${d}`));
    } else if (dry) {
      console.log(`  ${chalk.yellow("⚠")} Access app not found — will be created on deploy`);
    } else {
      const app = await createAccessApp(state.accountId, domains, state.brandName, auth);
      state.accessAppId = app.id;
      state.policyAud = app.aud;
      saveState(state);
      ok(`App created for ${domains.length} domain(s)`, dry);
      ok(`AUD: ${chalk.dim(state.policyAud.slice(0, 16))}...`, dry);
      console.log(chalk.dim("    Add policies in Zero Trust: Service Auth + Allow (hwk)"));
    }
  } catch (e) {
    fail("Access application setup", e);
  }
}

// --- Phase 2: Infrastructure ---

export async function phaseAssets(state: DeployState, dry: boolean): Promise<void> {
  console.log(chalk.bold("\n  Phase 2: Infrastructure\n"));

  const dbName = `${state.projectName}-db`;

  try {
    const dbId = checkD1Exists(dbName);
    if (dbId) {
      state.databaseId = dbId;
      saveState(state);
      ok(`D1 database exists ${chalk.dim(`(${dbName}: ${dbId.slice(0, 8)}...)`)}`, dry);
    } else if (dry) {
      console.log(`  ${chalk.yellow("⚠")} D1 database ${dbName} not found — will be created`);
    } else {
      state.databaseId = createD1(dbName);
      saveState(state);
      ok(
        `D1 database created ${chalk.dim(`(${dbName}: ${state.databaseId.slice(0, 8)}...)`)}`,
        dry,
      );
    }
  } catch (e) {
    fail("D1 database setup", e);
  }
}

// --- Phase 3: Worker ---

export async function phaseWorker(state: DeployState, dry: boolean): Promise<void> {
  console.log(chalk.bold("\n  Phase 3: Worker\n"));

  const dbName = `${state.projectName}-db`;

  if (!state.policyAud && !dry)
    fail("Worker deploy", new Error("No POLICY_AUD — Phase 1 did not complete. Run `hfs deploy`."));
  if (!state.databaseId && !dry)
    fail(
      "Worker deploy",
      new Error("No database_id — Phase 2 did not complete. Run `hfs deploy`."),
    );

  try {
    writeWranglerConfig(state);
    ok(dry ? "Wrangler config validated" : "Wrangler config written", dry);
  } catch (e) {
    fail("Wrangler config generation", e);
  }

  try {
    const hasKey = checkSecretExists();
    if (hasKey) {
      state.encryptionKeySet = true;
      ok("ENCRYPTION_KEY already set", dry);
    } else if (dry) {
      console.log(`  ${chalk.yellow("⚠")} ENCRYPTION_KEY not set — will be generated on deploy`);
    } else {
      setEncryptionKey();
      state.encryptionKeySet = true;
      saveState(state);
      ok("ENCRYPTION_KEY generated and set", dry);
    }
  } catch (e) {
    fail("Encryption key setup", e);
  }

  try {
    const pending = listPendingMigrations(dbName);
    if (pending.length === 0 || pending[0].startsWith("(")) {
      ok(pending[0]?.startsWith("(") ? pending[0] : "No pending migrations", dry);
    } else {
      for (const m of pending) console.log(`    ${chalk.dim("→")} ${m}`);
      if (dry) {
        ok(`${pending.length} migration(s) pending`, dry);
      } else {
        applyMigrations(dbName);
        ok(`${pending.length} migration(s) applied`, dry);
      }
    }
  } catch (e) {
    fail("D1 migration", e);
  }

  try {
    if (dry) {
      if (state.policyAud && state.databaseId) {
        dryRunDeploy();
        ok("Bundle valid (dry-run passed)", dry);
      } else {
        ok("Bundle validation skipped (needs Access + D1 first)", dry);
      }
    } else {
      console.log("");
      deployWorker();
      state.deployedAt = new Date().toISOString();
      saveState(state);
      ok(`Deployed to https://${state.domain}`, dry);
    }
  } catch (e) {
    fail("Worker deploy", e);
  }
}
