import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import type { SecretEntry } from "../client.js";
import { getConfig } from "../config.js";
import {
  e2eDecrypt,
  e2eEncrypt,
  ensureE2ETag,
  isE2E,
  loadRecipient,
  loadRecipients,
} from "../e2e.js";
import { client, confirm, die, errorMessage, readStdin } from "../helpers.js";

export function registerSecretCommands(program: Command): void {
  program
    .command("get <key>")
    .description("Get a decrypted secret")
    .option("-q, --quiet", "Print only the value (for piping)")
    .option("-j, --json", "Output as JSON")
    .option("--raw", "Skip e2e decryption (show ciphertext)")
    .action(async (key: string, opts: { quiet?: boolean; json?: boolean; raw?: boolean }) => {
      try {
        const secret = await client().get(key);

        // Auto-decrypt e2e secrets
        if (isE2E(secret.tags) && secret.value && !opts.raw) {
          try {
            secret.value = await e2eDecrypt(secret.value, getConfig().e2eIdentity);
          } catch (e) {
            if (opts.quiet) die(errorMessage(e));
            console.error(
              chalk.yellow("⚠ e2e decryption failed — showing ciphertext. Use --raw to suppress."),
            );
            console.error(chalk.dim(`  ${errorMessage(e)}`));
          }
        }

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
          if (secret.expires_at) {
            const exp = new Date(secret.expires_at);
            const isExpired = exp < new Date();
            const label = isExpired ? chalk.red("EXPIRED") : exp.toISOString().slice(0, 10);
            console.log(chalk.dim("expires:    ") + label);
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
    .option("--expires <date>", "Expiry date (YYYY-MM-DD or datetime)")
    .option("--from-stdin", "Read value from stdin")
    .option("--from-file <path>", "Read value from a file")
    .option("--e2e", "Encrypt client-side with age (for all eligible team members)")
    .option("--private", "Encrypt client-side for only yourself (not shared)")
    .option("--recipients <file>", "Encrypt for recipients in file (one age1... per line)")
    .action(
      async (
        key: string,
        value: string | undefined,
        opts: {
          description?: string;
          tags?: string;
          expires?: string;
          fromStdin?: boolean;
          fromFile?: string;
          e2e?: boolean;
          private?: boolean;
          recipients?: string;
        },
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

          // E2E encryption: encrypt client-side before sending to server
          if (opts.e2e || opts.private || opts.recipients) {
            const recipients: string[] = [];
            if (opts.recipients) {
              recipients.push(...loadRecipients(opts.recipients));
            } else if (opts.private) {
              // Private: encrypt only for yourself
              recipients.push(await loadRecipient(getConfig().e2eIdentity));
            } else {
              // Team: auto-fetch recipients from RBAC
              const c = client();
              try {
                const serverRecipients = await c.listRecipients(opts.tags);
                for (const r of serverRecipients) recipients.push(r.age_public_key);
              } catch {
                // Fallback: server may not support /recipients yet
              }
              // Always include own key
              const ownKey = await loadRecipient(getConfig().e2eIdentity);
              if (!recipients.includes(ownKey)) recipients.push(ownKey);
            }
            if (recipients.length > 1) {
              console.error(chalk.dim(`  encrypting for ${recipients.length} recipients`));
            }
            secretValue = await e2eEncrypt(secretValue, recipients);
            opts.tags = ensureE2ETag(opts.tags || "");
          }

          await client().set(key, secretValue, {
            description: opts.description,
            tags: opts.tags,
            expires_at: opts.expires || null,
          });
          console.log(
            `${chalk.green("✓")} Stored ${chalk.bold(key)}${opts.private ? chalk.cyan(" (e2e private)") : opts.e2e || opts.recipients ? chalk.cyan(" (e2e)") : ""}`,
          );
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
}
