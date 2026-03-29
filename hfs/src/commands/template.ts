import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { e2eDecrypt, isE2E } from "../e2e.js";
import { client, die, errorMessage } from "../helpers.js";

export function registerTemplateCommands(program: Command): void {
  program
    .command("template <file>")
    .description("Render a template file, replacing {{SECRET_KEY}} with secret values")
    .option("-o, --output <path>", "Write output to file instead of stdout")
    .action(async (file: string, opts: { output?: string }) => {
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

        for (const key of keys) {
          try {
            const secret = await c.get(key);
            let value = secret.value || "";
            if (isE2E(secret.tags) && value) {
              try {
                value = await e2eDecrypt(value, e2eIdentity);
              } catch {
                console.error(
                  chalk.yellow(`⚠ e2e decryption failed for ${key} — using ciphertext`),
                );
              }
            }
            values.set(key, value);
          } catch (e) {
            die(`Failed to fetch secret '${key}': ${errorMessage(e)}`);
          }
        }

        let output = template;
        for (const [key, value] of values) {
          output = output.replaceAll(`{{${key}}}`, value);
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
