import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { e2eDecrypt, e2eEncrypt, ensureE2ETag, isE2E, loadRecipient, tryDecrypt } from "../e2e.js";
import { client, confirm, die, errorMessage, fetchAllSecrets } from "../helpers.js";
import { startSpinner } from "../spinner.js";

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

        const e2eId = getConfig().e2eIdentity;
        const currentValue = await tryDecrypt(current.value || "", current.tags, e2eId);
        const versionValue = await tryDecrypt(version.value || "", current.tags, e2eId);

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
    .command("rewrap [key]")
    .description("Re-encrypt e2e secrets for current eligible recipients")
    .option("--all", "Rewrap all e2e secrets")
    .option("-f, --force", "Skip confirmation")
    .action(async (key: string | undefined, opts: { all?: boolean; force?: boolean }) => {
      try {
        if (!key && !opts.all) die("Specify a key or use --all to rewrap all e2e secrets");

        const c = client();
        const e2eId = getConfig().e2eIdentity;
        const ownKey = await loadRecipient(e2eId);

        const keysToRewrap: string[] = [];
        if (opts.all) {
          const secrets = await fetchAllSecrets(c);
          for (const s of secrets) {
            if (isE2E(s.tags)) keysToRewrap.push(s.key);
          }
          if (keysToRewrap.length === 0) {
            console.log(chalk.dim("No e2e secrets found."));
            return;
          }
          if (!opts.force) {
            if (!(await confirm(`Rewrap ${keysToRewrap.length} e2e secret(s)?`))) return;
          }
        } else {
          keysToRewrap.push(key as string);
        }

        let rewrapped = 0;
        const spin = startSpinner(`Rewrapping 0/${keysToRewrap.length}...`);
        for (const k of keysToRewrap) {
          const secret = await c.get(k);
          if (!isE2E(secret.tags)) {
            spin.stop();
            console.log(chalk.yellow(`⚠ ${k} is not e2e - skipping`));
            spin.start();
            spin.update(`Rewrapping ${rewrapped}/${keysToRewrap.length}...`);
            continue;
          }

          // Decrypt with our identity
          let plaintext: string;
          try {
            plaintext = await e2eDecrypt(secret.value || "", e2eId);
          } catch (e) {
            spin.stop();
            console.error(chalk.red(`✗ ${k}: decryption failed - ${errorMessage(e)}`));
            spin.start();
            spin.update(`Rewrapping ${rewrapped}/${keysToRewrap.length}...`);
            continue;
          }

          // Fetch current eligible recipients from RBAC
          const recipients: string[] = [];
          try {
            const serverRecipients = await c.listRecipients(secret.tags);
            for (const r of serverRecipients) recipients.push(r.age_public_key);
          } catch {
            // Fallback
          }
          if (!recipients.includes(ownKey)) recipients.push(ownKey);

          // Re-encrypt for current recipients
          const ciphertext = await e2eEncrypt(plaintext, recipients);
          await c.set(k, ciphertext, {
            description: secret.description,
            tags: ensureE2ETag(secret.tags),
            expires_at: secret.expires_at,
          });
          rewrapped++;
          spin.update(`Rewrapping ${rewrapped}/${keysToRewrap.length}...`);
        }

        spin.succeed(`Rewrapped ${rewrapped} secret(s)`);
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
