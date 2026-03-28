import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import type { SecretEntry } from "../client.js";
import { client, confirm, die, errorMessage, readStdin } from "../helpers.js";

export function registerSecretCommands(program: Command): void {
  program
    .command("get <key>")
    .description("Get a decrypted secret")
    .option("-q, --quiet", "Print only the value (for piping)")
    .option("-j, --json", "Output as JSON")
    .action(async (key: string, opts: { quiet?: boolean; json?: boolean }) => {
      try {
        const secret = await client().get(key);
        if (opts.json) {
          console.log(JSON.stringify(secret, null, 2));
          return;
        }
        if (opts.quiet) {
          process.stdout.write(secret.value || "");
        } else {
          console.log(chalk.dim("key:        ") + chalk.bold(secret.key));
          console.log(chalk.dim("value:      ") + secret.value);
          if (secret.description) {
            console.log(chalk.dim("desc:       ") + secret.description);
          }
          if (secret.tags) {
            console.log(chalk.dim("tags:       ") + secret.tags);
          }
          console.log(chalk.dim("created:    ") + secret.created_at);
          console.log(chalk.dim("updated:    ") + secret.updated_at);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("set <key> [value]")
    .description("Store a secret (use --from-stdin or --from-file for sensitive values)")
    .option("-d, --description <desc>", "Description for the secret")
    .option("-t, --tags <tags>", "Comma-separated tags (e.g. production,ci)")
    .option("--from-stdin", "Read value from stdin")
    .option("--from-file <path>", "Read value from a file")
    .action(
      async (
        key: string,
        value: string | undefined,
        opts: { description?: string; tags?: string; fromStdin?: boolean; fromFile?: string },
      ) => {
        try {
          let secretValue: string;

          if (opts.fromFile) {
            secretValue = readFileSync(opts.fromFile, "utf-8");
          } else if (opts.fromStdin) {
            secretValue = await readStdin();
          } else if (value !== undefined) {
            secretValue = value;
          } else {
            die("No value provided. Pass as argument, --from-stdin, or --from-file <path>");
          }

          await client().set(key, secretValue, opts.description, opts.tags);
          console.log(`${chalk.green("✓")} Stored ${chalk.bold(key)}`);
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );

  program
    .command("rm <key>")
    .alias("delete")
    .description("Delete a secret")
    .option("-f, --force", "Skip confirmation")
    .action(async (key: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          if (!(await confirm(`Delete ${chalk.bold(key)}? This cannot be undone.`))) return;
        }
        await client().delete(key);
        console.log(`${chalk.green("✓")} Deleted ${chalk.bold(key)}`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("ls")
    .alias("list")
    .description("List all secret keys")
    .option("-j, --json", "Output as JSON")
    .option("--all", "Fetch all secrets (no pagination limit)")
    .option("--offset <n>", "Skip first N results", "0")
    .option("-s, --search <pattern>", "Filter keys by pattern")
    .action(async (opts: { json?: boolean; all?: boolean; offset?: string; search?: string }) => {
      try {
        const c = client();
        let secrets: SecretEntry[];
        let total: number;
        if (opts.all) {
          let allSecrets: SecretEntry[] = [];
          let offset = 0;
          const pageSize = 500;
          while (true) {
            const page = await c.list({ limit: pageSize, offset, search: opts.search });
            allSecrets = allSecrets.concat(page.secrets);
            if (allSecrets.length >= page.total) break;
            offset += pageSize;
          }
          secrets = allSecrets;
          total = allSecrets.length;
        } else {
          const result = await c.list({
            offset: parseInt(opts.offset || "0", 10),
            search: opts.search,
          });
          secrets = result.secrets;
          total = result.total;
        }

        if (opts.json) {
          console.log(JSON.stringify({ secrets, total }, null, 2));
          return;
        }
        if (total === 0) {
          console.log(chalk.dim("No secrets stored."));
          return;
        }

        const maxKey = Math.max(...secrets.map((s) => s.key.length), 3);
        const maxDesc = Math.max(...secrets.map((s) => (s.description || "").length), 4);

        console.log(
          chalk.dim(`${"KEY".padEnd(maxKey + 2) + "DESCRIPTION".padEnd(maxDesc + 2)}UPDATED`),
        );

        for (const s of secrets) {
          console.log(
            chalk.bold(s.key.padEnd(maxKey + 2)) +
              (s.description || chalk.dim("—")).padEnd(maxDesc + 2) +
              chalk.dim(s.updated_at),
          );
        }

        const countLabel =
          total > secrets.length ? `${secrets.length} of ${total} secret(s)` : `${total} secret(s)`;
        console.log(chalk.dim(`\n${countLabel}`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("export")
    .description("Export all secrets as JSON (decrypted)")
    .action(async () => {
      try {
        const c = client();
        let secrets: Awaited<ReturnType<typeof c.exportAll>>;
        try {
          secrets = await c.exportAll();
        } catch {
          console.error(
            chalk.dim("Bulk export unavailable (interactive only), fetching individually..."),
          );
          const { secrets: list } = await c.list();
          secrets = [];
          for (const s of list) {
            secrets.push(await c.get(s.key));
          }
        }
        console.log(JSON.stringify(secrets, null, 2));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("import <file>")
    .description("Import secrets from a JSON file (from hfs export)")
    .option("--overwrite", "Overwrite existing secrets")
    .action(async (file: string, opts: { overwrite?: boolean }) => {
      try {
        const data = JSON.parse(readFileSync(file, "utf-8"));
        if (!Array.isArray(data)) die("Expected a JSON array of secrets");

        const valid = data.filter((e: { key?: string; value?: string }) => e.key && e.value);
        if (valid.length === 0) die("No valid entries found (each needs key + value)");
        const c = client();
        try {
          const result = await c.importAll(valid, opts.overwrite ?? false);
          console.log(chalk.dim(`${result.imported} imported, ${result.skipped} skipped`));
        } catch {
          console.error(
            chalk.dim("Bulk import unavailable (interactive only), importing individually..."),
          );
          const { secrets: existing } = await c.list();
          const existingKeys = new Set(existing.map((s) => s.key));
          let imported = 0;
          let skipped = 0;
          for (const entry of valid) {
            if (existingKeys.has(entry.key) && !opts.overwrite) {
              console.log(`${chalk.yellow("⚠")} Skipping ${chalk.bold(entry.key)} (exists)`);
              skipped++;
              continue;
            }
            await c.set(entry.key, entry.value, entry.description);
            console.log(`${chalk.green("✓")} Imported ${chalk.bold(entry.key)}`);
            imported++;
          }

          console.log(chalk.dim(`\n${imported} imported, ${skipped} skipped`));
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("env <keys...>")
    .description("Output secrets as KEY=value for shell (dashes converted to underscores)")
    .option("-e, --export", "Prefix each line with 'export'")
    .action(async (keys: string[], opts: { export?: boolean }) => {
      try {
        const c = client();
        for (const key of keys) {
          const secret = await c.get(key);
          const escaped = (secret.value || "").replace(/'/g, "'\\''");
          const prefix = opts.export ? "export " : "";
          const shellKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
          process.stdout.write(`${prefix}${shellKey}='${escaped}'\n`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

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
    .action(async (source: string, destination: string, opts: { move?: boolean }) => {
      try {
        const c = client();
        const secret = await c.get(source);
        await c.set(destination, secret.value || "", secret.description);
        if (opts.move) await c.delete(source);
        const verb = opts.move ? "Moved" : "Copied";
        console.log(
          `${chalk.green("\u2713")} ${verb} ${chalk.bold(source)} \u2192 ${chalk.bold(destination)}`,
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
