import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import { clearConfig, getConfig, getConfigPath, resolveAuth, setConfig } from "../config.js";
import { identityFilePath } from "../e2e.js";
import { confirm, errorMessage } from "../helpers.js";
import { getCaCertStatus } from "../tls.js";

function validateUrl(input: string): string {
  try {
    const parsed = new URL(input);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("URL must use http or https");
    }
    return parsed.origin;
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
}

export function registerConfigCommands(program: Command): void {
  const configCmd = program.command("config").description("Manage CLI configuration");

  configCmd
    .command("set")
    .description("Set vault URL")
    .option("--url <url>", "Vault URL (e.g. https://vault.example.com)")
    .option("--e2e-identity <path>", "Path to age identity file for e2e encryption")
    .option("--ca-cert <path>", "Path to custom CA certificate (e.g. Cloudflare WARP)")
    .action(async (opts: { url?: string; e2eIdentity?: string; caCert?: string }) => {
      if (opts.caCert) {
        const resolvedPath = resolve(opts.caCert);
        if (!existsSync(resolvedPath)) {
          console.error(chalk.red(`File not found: ${resolvedPath}`));
          process.exitCode = 1;
          return;
        }
        const content = readFileSync(resolvedPath, "utf-8");
        if (!content.includes("-----BEGIN CERTIFICATE-----")) {
          console.error(chalk.red("File does not contain a PEM certificate"));
          process.exitCode = 1;
          return;
        }
        setConfig("caCert", resolvedPath);
        console.log(`${chalk.green("✓")} CA certificate set to ${resolvedPath}`);
      }
      if (opts.e2eIdentity) {
        setConfig("e2eIdentity", opts.e2eIdentity);
        console.log(`${chalk.green("✓")} e2e identity set to ${opts.e2eIdentity}`);
      }
      if (opts.url) {
        setConfig("url", validateUrl(opts.url));
      } else if (!opts.e2eIdentity && !opts.caCert) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

        const cfg = getConfig();
        const url = await ask(`Vault URL${cfg.url ? ` [${cfg.url}]` : ""}: `);
        rl.close();

        if (url) setConfig("url", validateUrl(url));
      }

      console.log(`${chalk.green("✓")} Config saved to ${getConfigPath()}`);
      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  Human access:      hfs login"));
      console.log(chalk.dim("  Programmatic:      Set HFS_CLIENT_ID + HFS_CLIENT_SECRET env vars"));
    });

  configCmd
    .command("show")
    .description("Show current configuration and auth status")
    .action(async () => {
      const cfg = getConfig();

      console.log(chalk.dim("config:    ") + getConfigPath());
      console.log(chalk.dim("url:       ") + (cfg.url || chalk.red("not set")));

      console.log("");
      console.log(chalk.underline("Interactive (hfs login)"));
      if (cfg.jwt) {
        const expired = cfg.jwtExpiry && Date.now() / 1000 >= cfg.jwtExpiry;
        const expStr = cfg.jwtExpiry ? new Date(cfg.jwtExpiry * 1000).toLocaleString() : "unknown";
        console.log(
          chalk.dim("  session:   ") +
            (expired ? chalk.red(`expired (${expStr})`) : chalk.green(`valid until ${expStr}`)),
        );
      } else {
        console.log(chalk.dim("  session:   ") + chalk.dim("not logged in"));
      }

      console.log("");
      console.log(chalk.underline("Service Token (env vars)"));
      const envId = process.env.HFS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID;
      const envSecret = process.env.HFS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET;
      if (envId && envSecret) {
        console.log(chalk.dim("  status:    ") + chalk.green("configured"));
        console.log(`${chalk.dim("  client_id: ") + envId.slice(0, 16)}...`);
      } else if (envId || envSecret) {
        console.log(
          chalk.dim("  status:    ") +
            chalk.red("incomplete - need both HFS_CLIENT_ID and HFS_CLIENT_SECRET"),
        );
      } else {
        console.log(
          chalk.dim("  status:    ") + chalk.dim("not set (set HFS_CLIENT_ID + HFS_CLIENT_SECRET)"),
        );
      }

      console.log("");
      console.log(chalk.underline("E2E Encryption"));
      const e2ePath = cfg.e2eIdentity || identityFilePath();
      try {
        const { loadRecipient } = await import("../e2e.js");
        const pubkey = await loadRecipient(cfg.e2eIdentity);
        console.log(chalk.dim("  identity:  ") + chalk.dim(e2ePath));
        console.log(`${chalk.dim("  public key:")} ${chalk.cyan(pubkey)}`);
      } catch {
        console.log(chalk.dim("  identity:  ") + chalk.dim("not set (run hfs keygen)"));
      }

      console.log("");
      console.log(chalk.underline("TLS"));
      const tlsStatus = getCaCertStatus();
      if (tlsStatus.active) {
        console.log(chalk.dim("  ca cert:   ") + chalk.dim(tlsStatus.name || "configured"));
        console.log(chalk.dim("  source:    ") + chalk.green(tlsStatus.source));
      } else {
        console.log(chalk.dim("  ca cert:   ") + chalk.dim("system defaults"));
      }

      console.log("");
      try {
        const auth = resolveAuth();
        console.log(
          chalk.dim("active:    ") +
            chalk.green(auth.type === "jwt" ? "interactive session" : "service token"),
        );
      } catch (e) {
        console.log(chalk.dim("active:    ") + chalk.red(`none - ${errorMessage(e)}`));
      }
    });

  configCmd
    .command("clear")
    .description("Clear all saved configuration")
    .action(async () => {
      const confirmed = await confirm("Clear all saved config?");
      if (!confirmed) {
        console.log("Cancelled.");
        return;
      }
      clearConfig();
      console.log(`${chalk.green("✓")} Config cleared`);
    });
}
