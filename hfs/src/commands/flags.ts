import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage } from "../helpers.js";

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? chalk.green("true") : chalk.red("false");
  if (typeof value === "number") return chalk.cyan(String(value));
  if (typeof value === "object") return chalk.dim(JSON.stringify(value));
  return String(value);
}

function parseValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // not JSON
  }
  return raw;
}

export function registerFlagCommands(program: Command): void {
  const flagCmd = program.command("flag").description("Manage feature flags (KV-backed)");

  flagCmd
    .command("ls")
    .alias("list")
    .description("List all feature flags")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const flags = await client().listFlags();

        if (opts.json) {
          console.log(JSON.stringify(flags, null, 2));
          return;
        }

        if (flags.length === 0) {
          console.log(chalk.dim("No flags set."));
          return;
        }

        const maxKey = Math.max(...flags.map((f) => f.key.length), 4);
        const maxType = Math.max(...flags.map((f) => f.type.length), 4);
        console.log(chalk.dim(`${"FLAG".padEnd(maxKey + 2)}${"TYPE".padEnd(maxType + 2)}VALUE`));
        for (const f of flags) {
          const val = formatValue(f.value);
          console.log(
            `${chalk.bold(f.key.padEnd(maxKey + 2))}${chalk.dim(f.type.padEnd(maxType + 2))}${val}`,
          );
        }
        console.log(chalk.dim(`\n${flags.length} flag(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  flagCmd
    .command("get <key>")
    .description("Get a feature flag")
    .option("-q, --quiet", "Print only the value")
    .option("-j, --json", "Output as JSON")
    .action(async (key: string, opts: { quiet?: boolean; json?: boolean }) => {
      try {
        const flag = await client().getFlag(key);
        if (opts.json) {
          console.log(JSON.stringify(flag, null, 2));
          return;
        }
        if (opts.quiet) {
          const out =
            typeof flag.value === "object" ? JSON.stringify(flag.value) : String(flag.value);
          process.stdout.write(out);
        } else {
          console.log(chalk.dim("flag:     ") + chalk.bold(flag.key));
          console.log(chalk.dim("value:    ") + formatValue(flag.value));
          console.log(chalk.dim("type:     ") + flag.type);
          if (flag.description) console.log(chalk.dim("desc:     ") + flag.description);
          console.log(`${chalk.dim("updated:  ")}${flag.updated_by} at ${flag.updated_at}`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });

  flagCmd
    .command("set <key> <value>")
    .description("Set a flag (auto-detects type: bool, number, JSON, string)")
    .option("-d, --description <desc>", "Description")
    .action(async (key: string, rawValue: string, opts: { description?: string }) => {
      try {
        const value = parseValue(rawValue);
        const flag = await client().setFlag(key, value, opts.description);
        console.log(
          `${chalk.green("✓")} ${chalk.bold(flag.key)} = ${formatValue(flag.value)} ${chalk.dim(`(${flag.type})`)}`,
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });

  flagCmd
    .command("rm <key>")
    .alias("delete")
    .description("Delete a feature flag")
    .option("-f, --force", "Skip confirmation")
    .action(async (key: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          const confirmed = await confirm(`Delete flag ${chalk.bold(key)}?`);
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
        }
        await client().deleteFlag(key);
        console.log(`${chalk.green("✓")} Deleted flag ${chalk.bold(key)}`);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
