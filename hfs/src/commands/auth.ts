import { execFileSync } from "node:child_process";
import chalk from "chalk";
import type { Command } from "commander";
import { clearJwt, getConfig, storeJwt } from "../config.js";
import { client, die, errorMessage } from "../helpers.js";

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Authenticate via cloudflared (opens browser, tap YubiKey/passkey)")
    .action(async () => {
      const cfg = getConfig();
      const url = process.env.HFS_URL || cfg.url;
      if (!url) {
        die("Vault URL not configured. Run `hfs config set --url <url>` first.");
      }

      try {
        execFileSync("cloudflared", ["--version"], { stdio: "ignore", timeout: 10000 });
      } catch {
        die(
          "cloudflared not found. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
        );
      }

      console.log(chalk.dim("Opening browser for authentication..."));
      console.log(chalk.dim("Tap your YubiKey or confirm your passkey when prompted.\n"));

      try {
        // cloudflared needs a path protected by Access (/secrets, /tokens)
        const loginUrl = `${url.replace(/\/+$/, "")}/secrets`;
        const output = execFileSync("cloudflared", ["access", "login", loginUrl], {
          encoding: "utf-8",
          stdio: ["inherit", "pipe", "inherit"],
          timeout: 120000,
        }).trim();

        // cloudflared output varies by version - extract the JWT robustly
        const jwt = output.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
        if (!jwt) {
          die(
            "No JWT found in cloudflared output. " +
              "Try updating cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
          );
        }

        const { exp } = storeJwt(jwt);
        console.log(`${chalk.green("✓")} Authenticated successfully`);
        if (exp) {
          console.log(chalk.dim(`  Session expires: ${new Date(exp * 1000).toLocaleString()}`));
        }
      } catch (e) {
        const msg = errorMessage(e);
        if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
          die("Authentication timed out. Try again.");
        }
        die(`cloudflared login failed: ${msg}`);
      }
    });

  program
    .command("logout")
    .description("Clear the stored session token")
    .action(() => {
      clearJwt();
      console.log(`${chalk.green("✓")} Session cleared`);
    });

  program
    .command("health")
    .description("Check if the vault is reachable (no auth required)")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const url = process.env.HFS_URL || getConfig().url;
      if (!url) die("Vault URL not configured. Run `hfs config set --url <url>` first.");

      const base = url.replace(/\/+$/, "");
      try {
        const res = await fetch(`${base}/health`);
        const data = (await res.json()) as {
          status?: string;
          database?: string;
          kv?: string;
          version?: string;
          region?: string;
          maintenance?: boolean;
          read_only?: boolean;
          timestamp?: string;
        };

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          if (data.status !== "ok") process.exit(1);
          return;
        }

        const ok = (v?: string) => (v === "ok" ? chalk.green(v) : chalk.red(v || "unknown"));
        if (data.status === "ok") {
          console.log(`${chalk.green("\u2713")} Vault is healthy ${chalk.dim(`(${base})`)}`);
        } else {
          console.log(`${chalk.red("\u2717")} Vault is degraded ${chalk.dim(`(${base})`)}`);
        }
        console.log(`${chalk.dim("  database    ")}${ok(data.database)} ${chalk.dim("(D1)")}`);
        console.log(`${chalk.dim("  kv          ")}${ok(data.kv)} ${chalk.dim("(flags)")}`);
        if (data.maintenance) console.log(`  ${chalk.hex("#f97316")("maintenance   on")}`);
        if (data.read_only) console.log(`  ${chalk.hex("#f97316")("read-only     on")}`);
        if (data.version) console.log(chalk.dim(`  version     ${data.version}`));
        if (data.region) console.log(chalk.dim(`  region      ${data.region}`));
        if (data.status !== "ok") process.exit(1);
      } catch (e) {
        die(`Cannot reach vault at ${base}: ${errorMessage(e)}`);
      }
    });

  program
    .command("whoami")
    .description("Check authentication status")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const info = await client().whoami();
        if (opts.json) {
          console.log(JSON.stringify(info, null, 2));
          return;
        }
        console.log(chalk.dim("method:       ") + chalk.bold(info.method));
        console.log(chalk.dim("name:         ") + info.name);
        console.log(chalk.dim("identity:     ") + info.identity);
        console.log(chalk.dim("role:         ") + chalk.bold(info.role));
        console.log(chalk.dim("scopes:       ") + info.scopes.join(", "));
        if (info.policies !== undefined) console.log(chalk.dim("policies:     ") + info.policies);
        console.log(
          chalk.dim("e2e:          ") +
            (info.e2e ? chalk.green("registered") : chalk.yellow("not registered")),
        );
        console.log(
          chalk.dim("device bound: ") +
            (info.deviceBound ? chalk.green("yes") : chalk.yellow("no")),
        );
        if (info.warp) {
          const w = info.warp;
          console.log(
            chalk.dim("warp:         ") +
              (w.connected ? chalk.green("connected") : chalk.red("not connected")),
          );
          if (w.ztVerified) console.log(chalk.dim("zt verified:  ") + chalk.green("yes"));
          if (w.deviceId) console.log(chalk.dim("device id:    ") + w.deviceId);
        }
        if (info.lastLogin) console.log(chalk.dim("last login:   ") + info.lastLogin);
        if (info.totalSecrets !== undefined)
          console.log(`${chalk.dim("vault:        ")}${info.totalSecrets} secret(s)`);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
