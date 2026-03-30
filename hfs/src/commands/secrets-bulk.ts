import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { tryDecrypt } from "../e2e.js";
import { client, confirm, die, errorMessage, toShellLine } from "../helpers.js";
import { interpolate } from "../interpolate.js";
import { startSpinner } from "../spinner.js";

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
    .option("-f, --force", "Skip confirmation")
    .action(async (file: string, opts: { overwrite?: boolean; force?: boolean }) => {
      try {
        if (opts.overwrite && !opts.force) {
          if (!(await confirm(`Import may overwrite existing secrets. Continue?`))) return;
        }
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
          const spin = startSpinner(`Importing 0/${valid.length}...`);
          for (const entry of valid) {
            if (existingKeys.has(entry.key) && !opts.overwrite) {
              skipped++;
              spin.update(`Importing ${imported + skipped}/${valid.length}...`);
              continue;
            }
            await c.set(entry.key, entry.value, {
              description: entry.description,
              tags: entry.tags,
              expires_at: entry.expires_at,
            });
            imported++;
            spin.update(`Importing ${imported + skipped}/${valid.length}...`);
          }
          spin.succeed(`${imported} imported, ${skipped} skipped`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("env <keys...>")
    .description("Output secrets as KEY=value for shell (dashes converted to underscores)")
    .option("-e, --export", "Prefix each line with 'export'")
    .option("-r, --resolve", "Resolve ${SECRET} references in each value")
    .addHelpText(
      "after",
      `
Examples:
  $ eval $(hfs env -e API_KEY DB_PASS)  # load into shell
  $ hfs env API_KEY                     # output as KEY='value'
  $ hfs env DB_URL --resolve            # resolve references
`,
    )
    .action(async (keys: string[], opts: { export?: boolean; resolve?: boolean }) => {
      try {
        const c = client();
        const cfg = getConfig();
        // Shared cache for --resolve: avoids re-fetching the same secret across keys.
        const resolveCache = new Map<string, string>();

        const resolveRef = async (ref: string): Promise<string> => {
          if (resolveCache.has(ref)) return resolveCache.get(ref)!;
          const entry = await c.get(ref);
          const val = await tryDecrypt(entry.value || "", entry.tags, cfg.e2eIdentity);
          resolveCache.set(ref, val);
          return val;
        };

        for (const key of keys) {
          const secret = await c.get(key);
          let val = await tryDecrypt(secret.value || "", secret.tags, cfg.e2eIdentity);
          if (opts.resolve && val) {
            val = await interpolate(val, resolveRef);
          }
          process.stdout.write(toShellLine(key, val, opts.export ?? false));
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
