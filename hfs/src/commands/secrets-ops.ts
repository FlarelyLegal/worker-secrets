import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { e2eDecrypt, isE2E } from "../e2e.js";
import { client, confirm, die, errorMessage } from "../helpers.js";

export function registerSecretOpsCommands(program: Command): void {
  program
    .command("versions <key>")
    .description("List version history for a secret")
    .option("-j, --json", "Output as JSON")
    .action(async (key: string, opts: { json?: boolean }) => {
      try {
        const versions = await client().listVersions(key);
        if (opts.json) {
          console.log(JSON.stringify(versions, null, 2));
          return;
        }
        if (versions.length === 0) {
          console.log(chalk.dim("No version history."));
          return;
        }
        console.log(chalk.dim(`${"ID".padEnd(8)}${"CHANGED BY".padEnd(32)}CHANGED AT`));
        for (const v of versions) {
          console.log(
            `${String(v.id).padEnd(8)}${v.changed_by.padEnd(32)}${chalk.dim(v.changed_at)}`,
          );
        }
        console.log(chalk.dim(`\n${versions.length} version(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("diff <key> <version-id>")
    .description("Compare current secret value with a specific version")
    .action(async (key: string, versionId: string) => {
      try {
        const c = client();
        const [current, version] = await Promise.all([
          c.get(key),
          c.getVersion(key, parseInt(versionId, 10)),
        ]);

        let currentValue = current.value || "";
        let versionValue = version.value || "";

        // Auto-decrypt e2e
        const e2eId = getConfig().e2eIdentity;
        if (isE2E(current.tags) && currentValue) {
          try {
            currentValue = await e2eDecrypt(currentValue, e2eId);
          } catch {
            /* show ciphertext */
          }
        }
        if (isE2E(current.tags) && versionValue) {
          try {
            versionValue = await e2eDecrypt(versionValue, e2eId);
          } catch {
            /* show ciphertext */
          }
        }

        if (currentValue === versionValue) {
          console.log(chalk.dim("No differences."));
          return;
        }

        console.log(
          chalk.dim(`--- version ${version.id} (${version.changed_at} by ${version.changed_by})`),
        );
        console.log(chalk.dim("--- current"));
        const oldLines = versionValue.split("\n");
        const newLines = currentValue.split("\n");
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
          const old = oldLines[i];
          const cur = newLines[i];
          if (old === cur) {
            console.log(`  ${old ?? ""}`);
          } else {
            if (old !== undefined) console.log(chalk.red(`- ${old}`));
            if (cur !== undefined) console.log(chalk.green(`+ ${cur}`));
          }
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("restore <key> <version-id>")
    .description("Restore a secret to a previous version")
    .option("-f, --force", "Skip confirmation")
    .action(async (key: string, versionId: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          if (!(await confirm(`Restore ${chalk.bold(key)} to version ${versionId}?`))) return;
        }
        const result = await client().restoreVersion(key, parseInt(versionId, 10));
        console.log(
          `${chalk.green("✓")} Restored ${chalk.bold(result.key)} from version ${result.restored_from}`,
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("cp <source> <destination>")
    .description("Copy a secret to a new key")
    .option("-m, --move", "Move instead of copy (deletes source)")
    .option("-f, --force", "Skip confirmation for --move")
    .action(
      async (source: string, destination: string, opts: { move?: boolean; force?: boolean }) => {
        try {
          const c = client();
          if (opts.move && !opts.force) {
            if (
              !(await confirm(
                `Move ${chalk.bold(source)} → ${chalk.bold(destination)}? Source will be deleted.`,
              ))
            )
              return;
          }
          const secret = await c.get(source);
          await c.set(destination, secret.value || "", {
            description: secret.description,
            tags: secret.tags,
            expires_at: secret.expires_at,
          });
          if (opts.move) await c.delete(source);
          const verb = opts.move ? "Moved" : "Copied";
          console.log(
            `${chalk.green("\u2713")} ${verb} ${chalk.bold(source)} \u2192 ${chalk.bold(destination)}`,
          );
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );
}
