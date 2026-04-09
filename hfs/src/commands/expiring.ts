import chalk from "chalk";
import type { Command } from "commander";
import { expiryLabel, parseDurationMs } from "../duration.js";
import { client, die, errorMessage, fetchAllSecrets } from "../helpers.js";

export function registerExpiringCommands(program: Command): void {
  program
    .command("expiring")
    .description("List secrets expiring within a time window")
    .option("--within <duration>", "Time window to check (e.g. 7d, 24h, 2w)", "7d")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { within: string; json?: boolean }) => {
      try {
        const windowMs = parseDurationMs(opts.within);
        const cutoff = Date.now() + windowMs;

        const allSecrets = await fetchAllSecrets(client());

        // Filter: has expires_at and expiry is within the window (including already expired)
        const expiring = allSecrets
          .filter((s) => {
            if (!s.expires_at) return false;
            const exp = new Date(s.expires_at).getTime();
            return exp <= cutoff;
          })
          .sort((a, b) => {
            return (
              new Date(a.expires_at as string).getTime() -
              new Date(b.expires_at as string).getTime()
            );
          });

        if (opts.json) {
          console.log(JSON.stringify(expiring, null, 2));
          return;
        }

        if (expiring.length === 0) {
          console.log(chalk.dim(`No secrets expiring within ${opts.within}`));
          return;
        }

        const maxKey = Math.max(...expiring.map((s) => s.key.length), 3);
        const maxIn = Math.max(
          ...expiring.map((s) => expiryLabel(s.expires_at as string).plain.length),
          10,
        );

        console.log(
          chalk.dim(`${"KEY".padEnd(maxKey + 2)}${"EXPIRES IN".padEnd(maxIn + 2)}EXPIRES AT`),
        );

        for (const s of expiring) {
          const { plain, colored } = expiryLabel(s.expires_at as string);
          const expPadded = colored + " ".repeat(Math.max(0, maxIn + 2 - plain.length));
          console.log(
            chalk.bold(s.key.padEnd(maxKey + 2)) +
              expPadded +
              chalk.dim(`${s.expires_at?.slice(0, 16).replace("T", " ")} UTC`),
          );
        }

        console.log(chalk.dim(`\n${expiring.length} secret(s) expiring within ${opts.within}`));
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
