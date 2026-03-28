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
        execFileSync("cloudflared", ["--version"], { stdio: "ignore" });
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
        }).trim();

        // cloudflared output varies by version — extract the JWT robustly
        const jwt = output.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
        if (!jwt) {
          die(
            "No JWT found in cloudflared output. " +
              "Try updating cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
          );
        }

        storeJwt(jwt);

        const parts = jwt.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
          const exp = payload.exp ? new Date(payload.exp * 1000) : null;
          console.log(`${chalk.green("✓")} Authenticated successfully`);
          if (exp) {
            console.log(chalk.dim(`  Session expires: ${exp.toLocaleString()}`));
          }
        }
      } catch (e) {
        die(`cloudflared login failed: ${errorMessage(e)}`);
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
    .action(async () => {
      const url = process.env.HFS_URL || getConfig().url;
      if (!url) die("Vault URL not configured. Run `hfs config set --url <url>` first.");

      const base = url.replace(/\/+$/, "");
      try {
        const res = await fetch(`${base}/health`);
        const data = (await res.json()) as { status?: string };
        if (data.status === "ok") {
          console.log(`${chalk.green("✓")} Vault is healthy ${chalk.dim(`(${base})`)}`);
        } else {
          console.error(chalk.red(`✗ Unexpected response: ${JSON.stringify(data)}`));
          process.exit(1);
        }
      } catch (e) {
        die(`Cannot reach vault at ${base}: ${errorMessage(e)}`);
      }
    });

  program
    .command("whoami")
    .description("Check authentication status")
    .action(async () => {
      try {
        const info = await client().whoami();
        console.log(chalk.dim("method:   ") + chalk.bold(info.method));
        console.log(chalk.dim("name:     ") + info.name);
        console.log(chalk.dim("identity: ") + info.identity);
        console.log(chalk.dim("scopes:   ") + info.scopes.join(", "));
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
