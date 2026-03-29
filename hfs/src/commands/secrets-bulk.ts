import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { e2eDecrypt, isE2E } from "../e2e.js";
import { client, die, errorMessage } from "../helpers.js";

export function registerSecretBulkCommands(program: Command): void {
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
            await c.set(entry.key, entry.value, {
              description: entry.description,
              tags: entry.tags,
              expires_at: entry.expires_at,
            });
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
          // Auto-decrypt e2e secrets
          if (isE2E(secret.tags) && secret.value) {
            try {
              secret.value = await e2eDecrypt(secret.value, getConfig().e2eIdentity);
            } catch {
              // If decryption fails, output the ciphertext (let the user notice)
            }
          }
          const escaped = (secret.value || "").replace(/'/g, "'\\''");
          const prefix = opts.export ? "export " : "";
          const shellKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
          process.stdout.write(`${prefix}${shellKey}='${escaped}'\n`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
