import chalk from "chalk";
import type { Command } from "commander";
import { client, die, errorMessage } from "../helpers.js";

export function registerAuditCommands(program: Command): void {
  const audit = program
    .command("audit")
    .description("View audit log and secret consumer reports (requires interactive auth)");

  // --- audit log (default subcommand) ---

  audit
    .command("log")
    .description("View audit log entries")
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

  // --- audit consumers <key> ---

  audit
    .command("consumers <key>")
    .description("Show who has accessed a specific secret")
    .option("-j, --json", "Output as JSON")
    .option("--from <date>", "Filter from date (YYYY-MM-DD)")
    .option("--to <date>", "Filter to date (YYYY-MM-DD)")
    .action(async (key: string, opts: { json?: boolean; from?: string; to?: string }) => {
      try {
        const consumers = await client().auditConsumers(key, {
          from: opts.from,
          to: opts.to,
        });

        if (opts.json) {
          console.log(JSON.stringify(consumers, null, 2));
          return;
        }

        if (consumers.length === 0) {
          console.log(chalk.dim(`No access records found for ${chalk.bold(key)}.`));
          return;
        }

        const totalAccesses = consumers.reduce((sum, c) => sum + c.access_count, 0);

        const IDENTITY_W = 30;
        const METHOD_W = 14;
        const AGENT_W = 22;
        const COUNT_W = 7;

        console.log(
          chalk.dim(
            `${"IDENTITY".padEnd(IDENTITY_W)}${"METHOD".padEnd(METHOD_W)}${"AGENT".padEnd(AGENT_W)}${"COUNT".padEnd(COUNT_W)}LAST ACCESSED`,
          ),
        );

        for (const c of consumers) {
          const identity = c.identity.padEnd(IDENTITY_W);
          const method = c.method.padEnd(METHOD_W);
          const agent = (c.user_agent ?? " - ").slice(0, AGENT_W - 2).padEnd(AGENT_W);
          const count = String(c.access_count).padEnd(COUNT_W);
          const last = chalk.dim(c.last_accessed.replace("T", " ").replace(/\.\d+Z$/, ""));
          console.log(`${identity}${chalk.yellow(method)}${agent}${chalk.bold(count)}${last}`);
        }

        const summary = `\n${consumers.length} unique consumer${consumers.length === 1 ? "" : "s"}, ${totalAccesses} total access${totalAccesses === 1 ? "" : "es"}`;
        console.log(chalk.dim(summary));
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
