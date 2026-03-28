import chalk from "chalk";
import type { Command } from "commander";
import { client, die, errorMessage } from "../helpers.js";

export function registerAuditCommands(program: Command): void {
  program
    .command("audit")
    .description("View audit log (requires interactive auth)")
    .option("-n, --limit <n>", "Number of entries", "20")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { limit: string; json?: boolean }) => {
      try {
        const entries = await client().audit(parseInt(opts.limit, 10));

        if (opts.json) {
          console.log(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          console.log(chalk.dim("No audit entries."));
          return;
        }

        for (const e of entries) {
          const action = e.action.padEnd(8);
          const key = e.secret_key || "";
          const who = e.method === "interactive" ? chalk.cyan("you") : chalk.yellow(e.method);
          console.log(`${chalk.dim(e.timestamp)}  ${who.padEnd(25)}${chalk.bold(action)}  ${key}`);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
