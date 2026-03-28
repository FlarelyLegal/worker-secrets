import chalk from "chalk";
import type { Command } from "commander";
import { client, die, errorMessage } from "../helpers.js";

export function registerAuditCommands(program: Command): void {
  program
    .command("audit")
    .description("View audit log (requires interactive auth)")
    .option("-n, --limit <n>", "Number of entries", "20")
    .option("--offset <n>", "Skip first N entries", "0")
    .option("-j, --json", "Output as JSON")
    .option("--identity <email>", "Filter by identity")
    .option("--action <action>", "Filter by action (get, set, delete, list, etc.)")
    .option("--key <key>", "Filter by secret key")
    .option("--method <method>", "Filter by method (interactive, token name)")
    .option("--from <date>", "Filter from date (YYYY-MM-DD)")
    .option("--to <date>", "Filter to date (YYYY-MM-DD)")
    .action(
      async (opts: {
        limit: string;
        offset: string;
        json?: boolean;
        identity?: string;
        action?: string;
        key?: string;
        method?: string;
        from?: string;
        to?: string;
      }) => {
        try {
          const entries = await client().audit({
            limit: parseInt(opts.limit, 10),
            offset: parseInt(opts.offset, 10),
            identity: opts.identity,
            action: opts.action,
            key: opts.key,
            method: opts.method,
            from: opts.from,
            to: opts.to,
          });

          if (opts.json) {
            console.log(JSON.stringify(entries, null, 2));
            return;
          }

          if (entries.length === 0) {
            console.log(chalk.dim("No audit entries."));
            return;
          }

          const maxAction = Math.max(...entries.map((e) => e.action.length), 6);

          for (const e of entries) {
            const action = e.action.padEnd(maxAction + 2);
            const key = e.secret_key || "";
            const who = e.method === "interactive" ? chalk.cyan("you") : chalk.yellow(e.method);
            console.log(
              `${chalk.dim(e.timestamp)}  ${who.padEnd(25)}${chalk.bold(action)}  ${key}`,
            );
          }
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );
}
