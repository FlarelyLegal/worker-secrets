import chalk from "chalk";
import type { Command } from "commander";
import type { SecretEntry } from "../client.js";
import { getConfig } from "../config.js";
import { tryDecrypt } from "../e2e.js";
import { client, die, errorMessage, fetchAllSecrets, parseTags, toShellLine } from "../helpers.js";
import { interpolate } from "../interpolate.js";

/** Filter secrets that include the given profile tag. */
function filterByProfile(secrets: SecretEntry[], profile: string): SecretEntry[] {
  return secrets.filter((s) => parseTags(s.tags).includes(profile));
}

export function registerProfileCommands(program: Command): void {
  const profileCmd = program
    .command("profile")
    .description("Manage bulk environment profiles (tag-based secret groups)");

  // hfs profile ls
  profileCmd
    .command("ls")
    .alias("list")
    .description("List available profiles (unique tags used as environment names)")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const secrets = await fetchAllSecrets(client());
        const counts = new Map<string, number>();
        for (const s of secrets) {
          for (const tag of parseTags(s.tags)) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
        if (opts.json) {
          const result = [...counts.entries()].map(([name, count]) => ({ name, count }));
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (counts.size === 0) {
          console.log(chalk.dim("No profiles found. Tag secrets to create profiles."));
          return;
        }
        const profiles = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const maxName = Math.max(...profiles.map(([n]) => n.length), 7);
        console.log(chalk.dim(`${"PROFILE".padEnd(maxName + 2)}SECRETS`));
        for (const [name, count] of profiles) {
          console.log(`${chalk.bold(name.padEnd(maxName + 2))}${count}`);
        }
        console.log(chalk.dim(`\n${profiles.length} profile(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  // hfs profile show <name>
  profileCmd
    .command("show <name>")
    .description("Show secrets in a profile (filtered by tag)")
    .option("-j, --json", "Output as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      try {
        const secrets = filterByProfile(await fetchAllSecrets(client()), name);
        if (opts.json) {
          console.log(JSON.stringify(secrets, null, 2));
          return;
        }
        if (secrets.length === 0) {
          console.log(chalk.dim(`No secrets tagged with '${name}'.`));
          return;
        }
        const maxKey = Math.max(...secrets.map((s) => s.key.length), 3);
        const maxDesc = Math.max(...secrets.map((s) => (s.description || "").length), 11);
        console.log(
          chalk.dim(`${"KEY".padEnd(maxKey + 2)}${"DESCRIPTION".padEnd(maxDesc + 2)}UPDATED`),
        );
        for (const s of secrets) {
          console.log(
            chalk.bold(s.key.padEnd(maxKey + 2)) +
              (s.description || chalk.dim(" - ")).padEnd(maxDesc + 2) +
              chalk.dim(s.updated_at),
          );
        }
        console.log(chalk.dim(`\n${secrets.length} secret(s) in profile '${name}'`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  // hfs profile env <name>
  profileCmd
    .command("env <name>")
    .description("Export a profile's secrets as shell variables")
    .option("-e, --export", "Prefix each line with 'export '")
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional help text
    .option("-r, --resolve", "Resolve ${SECRET} references in values")
    .option("-j, --json", "Output as JSON object")
    .action(async (name: string, opts: { export?: boolean; resolve?: boolean; json?: boolean }) => {
      try {
        const entries = filterByProfile(await fetchAllSecrets(client()), name);
        if (entries.length === 0) {
          console.error(chalk.dim(`No secrets tagged with '${name}'.`));
          return;
        }

        const c = client();
        const cfg = getConfig();
        const cache = new Map<string, string>();

        const fetchValue = async (key: string): Promise<string> => {
          if (cache.has(key)) return cache.get(key) as string;
          const secret = await c.get(key);
          const val = await tryDecrypt(secret.value || "", secret.tags, cfg.e2eIdentity);
          cache.set(key, val);
          return val;
        };

        const result: Record<string, string> = {};
        for (const entry of entries) {
          let val = await fetchValue(entry.key);
          if (opts.resolve && val) {
            val = await interpolate(val, fetchValue);
          }
          result[entry.key] = val;
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        for (const [key, val] of Object.entries(result)) {
          process.stdout.write(toShellLine(key, val, opts.export ?? false));
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  // hfs profile diff <a> <b>
  profileCmd
    .command("diff <a> <b>")
    .description("Compare secrets between two profiles")
    .option("-j, --json", "Output as JSON")
    .action(async (a: string, b: string, opts: { json?: boolean }) => {
      try {
        const all = await fetchAllSecrets(client());
        const aSecrets = new Map(filterByProfile(all, a).map((s) => [s.key, s]));
        const bSecrets = new Map(filterByProfile(all, b).map((s) => [s.key, s]));

        const onlyA = [...aSecrets.keys()].filter((k) => !bSecrets.has(k)).sort();
        const onlyB = [...bSecrets.keys()].filter((k) => !aSecrets.has(k)).sort();
        const inBoth = [...aSecrets.keys()].filter((k) => bSecrets.has(k)).sort();

        if (opts.json) {
          console.log(JSON.stringify({ only_a: onlyA, only_b: onlyB, shared: inBoth }, null, 2));
          return;
        }

        if (onlyA.length === 0 && onlyB.length === 0 && inBoth.length === 0) {
          console.log(chalk.dim(`Both profiles '${a}' and '${b}' are empty.`));
          return;
        }

        if (onlyA.length > 0) {
          console.log(chalk.dim(`\nOnly in '${a}':`));
          for (const k of onlyA) console.log(chalk.red(`  - ${k}`));
        }

        if (onlyB.length > 0) {
          console.log(chalk.dim(`\nOnly in '${b}':`));
          for (const k of onlyB) console.log(chalk.red(`  + ${k}`));
        }

        if (inBoth.length > 0) {
          const same: string[] = [];
          const different: string[] = [];
          for (const k of inBoth) {
            const aUpdated = aSecrets.get(k)?.updated_at;
            const bUpdated = bSecrets.get(k)?.updated_at;
            if (aUpdated === bUpdated) {
              same.push(k);
            } else {
              different.push(k);
            }
          }
          if (different.length > 0) {
            console.log(chalk.dim("\nDifferent values (by updated timestamp):"));
            for (const k of different) console.log(chalk.yellow(`  ~ ${k}`));
          }
          if (same.length > 0) {
            console.log(chalk.dim("\nMatching (same updated timestamp):"));
            for (const k of same) console.log(chalk.green(`  = ${k}`));
          }
        }

        const total = onlyA.length + onlyB.length + inBoth.length;
        console.log(
          chalk.dim(
            `\n${total} key(s) total - ${onlyA.length} only in '${a}', ${onlyB.length} only in '${b}', ${inBoth.length} shared`,
          ),
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
