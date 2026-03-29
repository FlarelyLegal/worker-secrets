import { existsSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { generateKeypair, identityFilePath, loadRecipient } from "../e2e.js";
import { client, confirm, die, errorMessage } from "../helpers.js";
import { computeCaFingerprint } from "../tls.js";

export function registerKeygenCommands(program: Command): void {
  program
    .command("keygen")
    .description("Generate an age identity for end-to-end encryption")
    .option("-f, --force", "Overwrite existing identity")
    .option("--register", "Upload public key to your vault profile")
    .action(async (opts: { force?: boolean; register?: boolean }) => {
      try {
        const path = getConfig().e2eIdentity || identityFilePath();
        if (existsSync(path) && !opts.force) {
          const recipient = await loadRecipient(path);
          console.log(`Identity already exists at ${chalk.dim(path)}`);
          console.log(`  public key: ${chalk.cyan(recipient)}`);
          if (opts.register) {
            await registerKey(recipient);
          } else {
            console.log(
              chalk.dim("\nUse --force to regenerate (existing secrets won't be readable)"),
            );
            console.log(chalk.dim("Use --register to upload your key to the vault"));
          }
          return;
        }

        if (existsSync(path) && opts.force) {
          if (!(await confirm("Regenerating will make existing e2e secrets unreadable. Continue?")))
            return;
        }

        const { recipient } = await generateKeypair();
        console.log(`${chalk.green("✓")} Identity generated`);
        console.log(`  file:       ${chalk.dim(identityFilePath())}`);
        console.log(`  public key: ${chalk.cyan(recipient)}`);

        if (opts.register) {
          await registerKey(recipient);
        } else {
          console.log(
            chalk.dim("\nShare your public key with teammates. Keep the identity file private."),
          );
          console.log(chalk.dim("Run with --register to upload your key to the vault."));
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("pubkey")
    .description("Show your age public key")
    .option("--register", "Upload public key to your vault profile")
    .action(async (opts: { register?: boolean }) => {
      try {
        const path = getConfig().e2eIdentity;
        const recipient = await loadRecipient(path);
        console.log(recipient);
        if (opts.register) {
          await registerKey(recipient);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}

async function registerKey(pubkey: string): Promise<void> {
  try {
    const c = client();
    const whoami = await c.whoami();
    await c.updateUser(whoami.identity, {
      age_public_key: pubkey,
      zt_fingerprint: computeCaFingerprint() || "",
    });
    console.log(`${chalk.green("✓")} Public key registered for ${chalk.bold(whoami.identity)}`);
  } catch (e) {
    console.error(chalk.yellow(`⚠ Could not register key: ${errorMessage(e)}`));
    console.error(chalk.dim("  Ask an admin to run: hfs user update <email> --pubkey <key>"));
  }
}
