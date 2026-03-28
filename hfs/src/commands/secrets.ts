import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage, readStdin } from "../helpers.js";

export function registerSecretCommands(program: Command): void {
  program
    .command("get <key>")
    .description("Get a decrypted secret")
    .option("-q, --quiet", "Print only the value (for piping)")
    .action(async (key: string, opts: { quiet?: boolean }) => {
      try {
        const secret = await client().get(key);
        if (opts.quiet) {
          process.stdout.write(secret.value || "");
        } else {
          console.log(chalk.dim("key:        ") + chalk.bold(secret.key));
          console.log(chalk.dim("value:      ") + secret.value);
          if (secret.description) {
            console.log(chalk.dim("desc:       ") + secret.description);
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
    .description("Store a secret")
    .option("-d, --description <desc>", "Description for the secret")
    .option("--from-stdin", "Read value from stdin")
    .option("--from-file <path>", "Read value from a file")
    .action(
      async (
        key: string,
        value: string | undefined,
        opts: { description?: string; fromStdin?: boolean; fromFile?: string },
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

          await client().set(key, secretValue, opts.description);
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
          const confirmed = await confirm(`Delete ${chalk.bold(key)}? This cannot be undone.`);
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
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
    .action(async (opts: { json?: boolean }) => {
      try {
        const secrets = await client().list();

        if (opts.json) {
          console.log(JSON.stringify(secrets, null, 2));
          return;
        }

        if (secrets.length === 0) {
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

        console.log(chalk.dim(`\n${secrets.length} secret(s)`));
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
          // Bulk export (single request, interactive auth only)
          secrets = await c.exportAll();
        } catch {
          // Fall back to N+1 for service tokens
          const list = await c.list();
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
          // Bulk import (single request, interactive auth only)
          const result = await c.importAll(valid, opts.overwrite ?? false);
          console.log(chalk.dim(`${result.imported} imported, ${result.skipped} skipped`));
        } catch {
          // Fall back to N+1 for service tokens
          const existing = await c.list();
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
    .description("Output secrets as KEY=value for shell sourcing")
    .option("-e, --export", "Prefix each line with 'export'")
    .action(async (keys: string[], opts: { export?: boolean }) => {
      try {
        const c = client();
        for (const key of keys) {
          const secret = await c.get(key);
          const escaped = (secret.value || "").replace(/'/g, "'\\''");
          const prefix = opts.export ? "export " : "";
          process.stdout.write(`${prefix}${key}='${escaped}'\n`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
