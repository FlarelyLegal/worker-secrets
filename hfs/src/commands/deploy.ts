import { createInterface } from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import {
  checkWrangler,
  copyWorkerSource,
  type DeployState,
  installDeps,
  loadState,
} from "../deploy/index.js";
import { fail, phaseAccess, phaseAssets, phaseWorker } from "../deploy/phases.js";
import { die, errorMessage } from "../helpers.js";

function ask(rl: ReturnType<typeof createInterface>, q: string, def?: string): Promise<string> {
  const hint = def ? ` [${def}]` : "";
  return new Promise((r) => rl.question(`  ${q}${hint}: `, (a) => r(a.trim() || def || "")));
}

async function collectConfig(state: DeployState): Promise<DeployState> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const s = { ...state };

  s.projectName = s.projectName || (await ask(rl, "Project name", "secret-vault"));
  s.brandName = s.brandName || (await ask(rl, "Brand name", "Secret Vault"));
  s.accountId = s.accountId || (await ask(rl, "Account ID"));
  s.domain = s.domain || (await ask(rl, "Primary domain"));
  const extraDomains = await ask(
    rl,
    "Additional domains (comma-separated, or empty)",
    s.domains.length > 1 ? s.domains.slice(1).join(",") : "",
  );
  s.domains = [
    s.domain,
    ...extraDomains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
  ];
  s.domains = [...new Set(s.domains)];
  s.emails = s.emails || (await ask(rl, "Allowed emails (comma-separated)"));
  s.teamDomain =
    s.teamDomain ||
    (await ask(rl, "Access team domain", `https://${s.domain.split(".").slice(-2).join(".")}`));
  if (!s.workersDev) s.workersDev = (await ask(rl, "Enable workers.dev? (y/n)", "n")) === "y";
  if (!s.observability)
    s.observability = (await ask(rl, "Enable observability? (y/n)", "n")) === "y";

  rl.close();
  if (!s.accountId) die("Account ID is required.");
  if (!s.emails) die("At least one email is required.");
  return s;
}

async function setup(opts: Record<string, unknown>): Promise<DeployState> {
  const state = loadState();
  if (opts.accountId) state.accountId = opts.accountId as string;
  if (opts.domain) state.domain = opts.domain as string;
  if (opts.domains) {
    const all = (opts.domains as string)
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    state.domain = state.domain || all[0];
    state.domains = [...new Set([state.domain, ...all])];
  }
  if (opts.emails) state.emails = opts.emails as string;
  if (opts.teamDomain) state.teamDomain = opts.teamDomain as string;
  if (opts.workersDev !== undefined) state.workersDev = opts.workersDev as boolean;
  if (opts.observability !== undefined) state.observability = opts.observability as boolean;

  console.log(chalk.bold(`\n  Preparing ${state.projectName} deploy\n`));

  try {
    copyWorkerSource();
    installDeps();
    checkWrangler();
    console.log(`  ${chalk.green("✓")} Worker source + dependencies ready`);
  } catch (e) {
    fail("Setup", e);
  }

  const needsConfig = !state.accountId || !state.domain || !state.emails;
  return needsConfig ? collectConfig(state) : state;
}

export function registerDeployCommands(program: Command): void {
  const cmd = program.command("deploy").description("Deploy the vault Worker to Cloudflare");

  cmd
    .option("--account-id <id>", "Cloudflare account ID")
    .option("--domain <domain>", "Primary custom domain")
    .option("--domains <domains>", "All custom domains (comma-separated)")
    .option("--emails <emails>", "Comma-separated allowed emails")
    .option("--team-domain <domain>", "Access team domain URL")
    .option("--workers-dev", "Enable workers.dev subdomain")
    .option("--no-workers-dev", "Disable workers.dev subdomain")
    .option("--observability", "Enable observability/logs")
    .option("--no-observability", "Disable observability/logs")
    .option("--dry-run", "Validate every step without making changes")
    .action(async (opts) => {
      const dry = opts.dryRun ?? false;
      try {
        const state = await setup(opts);
        await phaseAccess(state, dry);
        await phaseAssets(state, dry);
        await phaseWorker(state, dry);

        if (dry) {
          console.log(
            `\n  ${chalk.yellow("○")} Dry run complete. Run without --dry-run to deploy.\n`,
          );
        } else {
          console.log(chalk.dim(`\n  Next: hfs config set --url https://${state.domain}`));
          console.log(chalk.dim("        hfs login\n"));
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  cmd
    .command("status")
    .description("Show deploy state")
    .action(() => {
      const s = loadState();
      const f = (v: string | boolean) => (v ? chalk.green(String(v)) : chalk.dim("(not set)"));
      console.log(chalk.bold("\n  Deploy state\n"));
      console.log(`  account:     ${f(s.accountId)}`);
      console.log(`  domain:      ${f(s.domain)}`);
      if (s.domains.length > 1)
        console.log(`  domains:     ${s.domains.map((d) => chalk.green(d)).join(", ")}`);
      console.log(`  access app:  ${f(s.accessAppId)}`);
      console.log(`  policy AUD:  ${f(s.policyAud)}`);
      console.log(`  database:    ${f(s.databaseId)}`);
      console.log(`  encryption:  ${f(s.encryptionKeySet)}`);
      console.log(`  deployed:    ${f(s.deployedAt)}`);
      console.log("");
    });
}
