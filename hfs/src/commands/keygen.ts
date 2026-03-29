import { existsSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { generateKeypair, identityFilePath, loadRecipient } from "../e2e.js";
import { confirm, die, errorMessage } from "../helpers.js";

export function registerKeygenCommands(program: Command): void {
  program
    .command("keygen")
    .description("Generate an age identity for end-to-end encryption")
    .option("-f, --force", "Overwrite existing identity")
    .action(async (opts: { force?: boolean }) => {
      try {
        const path = getConfig().e2eIdentity || identityFilePath();
        if (existsSync(path) && !opts.force) {
          const recipient = await loadRecipient(path);
          console.log(`Identity already exists at ${chalk.dim(path)}`);
          console.log(`  public key: ${chalk.cyan(recipient)}`);
          console.log(
            chalk.dim("\nUse --force to regenerate (existing secrets won't be readable)"),
          );
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
        console.log(
          chalk.dim("\nShare your public key with teammates. Keep the identity file private."),
        );
        console.log(chalk.dim("Use it:  hfs set SECRET value --e2e"));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("pubkey")
    .description("Show your age public key")
    .action(async () => {
      try {
        const path = getConfig().e2eIdentity;
        const recipient = await loadRecipient(path);
        console.log(recipient);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
