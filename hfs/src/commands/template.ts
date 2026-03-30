import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { tryDecrypt } from "../e2e.js";
import { client, die, errorMessage } from "../helpers.js";
import { interpolate } from "../interpolate.js";

export function registerTemplateCommands(program: Command): void {
  program
    .command("template <file>")
    .description("Render a template file, replacing {{SECRET_KEY}} with secret values")
    .option("-o, --output <path>", "Write output to file instead of stdout")
    .option("-r, --resolve", "Resolve ${SECRET} references inside substituted values")
    .addHelpText(
      "after",
      `
Examples:
  $ hfs template .env.tpl               # render to stdout
  $ hfs template .env.tpl -o .env       # render to file
  $ hfs template config.tpl --resolve   # resolve \${SECRET} refs in values
`,
    )
    .action(async (file: string, opts: { output?: string; resolve?: boolean }) => {
      try {
        const template = readFileSync(file, "utf-8");
        const matches = [...template.matchAll(/\{\{([A-Za-z0-9_.-]+)\}\}/g)];
        const keys = [...new Set(matches.map((m) => m[1]))];

        if (keys.length === 0) {
          die("No {{SECRET_KEY}} placeholders found in template");
        }

        const c = client();
        const values = new Map<string, string>();
        const e2eIdentity = getConfig().e2eIdentity;
        // Shared fetch+decrypt helper used by both template substitution and interpolation.
        const fetchAndDecrypt = async (key: string): Promise<string> => {
          const secret = await c.get(key);
          return tryDecrypt(secret.value || "", secret.tags, e2eIdentity);
        };

        for (const key of keys) {
          try {
            values.set(key, await fetchAndDecrypt(key));
          } catch (e) {
            die(`Failed to fetch secret '${key}': ${errorMessage(e)}`);
          }
        }

        let output = template;
        for (const [key, value] of values) {
          output = output.replaceAll(`{{${key}}}`, value);
        }

        // Optionally resolve any ${SECRET} references that appeared inside substituted values.
        if (opts.resolve) {
          const cache = new Map<string, string>(values);
          const resolveRef = async (ref: string): Promise<string> => {
            if (cache.has(ref)) return cache.get(ref)!;
            const val = await fetchAndDecrypt(ref);
            cache.set(ref, val);
            return val;
          };
          output = await interpolate(output, resolveRef);
        }

        if (opts.output) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(opts.output, output);
          console.error(
            `${chalk.green("✓")} Rendered ${keys.length} secret(s) → ${chalk.dim(opts.output)}`,
          );
        } else {
          process.stdout.write(output);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
