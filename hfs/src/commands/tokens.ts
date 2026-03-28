import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage } from "../helpers.js";

export function registerTokenCommands(program: Command): void {
  const tokenCmd = program.command("token").description("Manage service token identities");

  tokenCmd
    .command("register <client-id>")
    .description("Register a service token with a name and scopes")
    .requiredOption("-n, --name <name>", "Friendly name (e.g. code-review-worker)")
    .option("-d, --description <desc>", "Description")
    .option("-s, --scopes <scopes>", "Comma-separated scopes: read,write,delete or * (default: *)")
    .action(
      async (clientId: string, opts: { name: string; description?: string; scopes?: string }) => {
        try {
          await client().registerToken(clientId, opts.name, {
            description: opts.description,
            scopes: opts.scopes,
          });
          console.log(
            `${chalk.green("✓")} Registered ${chalk.bold(opts.name)} (${clientId.slice(0, 12)}...)`,
          );
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );

  tokenCmd
    .command("revoke <client-id>")
    .description("Unregister a service token (revokes vault access)")
    .option("-f, --force", "Skip confirmation")
    .action(async (clientId: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          const confirmed = await confirm(`Revoke token ${chalk.bold(clientId.slice(0, 16))}...?`);
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
        }
        await client().revokeToken(clientId);
        console.log(`${chalk.green("✓")} Revoked ${clientId.slice(0, 16)}...`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  tokenCmd
    .command("ls")
    .description("List registered service tokens")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const tokens = await client().listTokens();

        if (opts.json) {
          console.log(JSON.stringify(tokens, null, 2));
          return;
        }

        if (tokens.length === 0) {
          console.log(chalk.dim("No service tokens registered."));
          return;
        }

        const maxName = Math.max(...tokens.map((t) => t.name.length), 4);

        console.log(
          chalk.dim(
            `${"NAME".padEnd(maxName + 2) + "SCOPES".padEnd(16) + "LAST USED".padEnd(22)}CLIENT ID`,
          ),
        );

        for (const t of tokens) {
          console.log(
            chalk.bold(t.name.padEnd(maxName + 2)) +
              t.scopes.padEnd(16) +
              (t.last_used_at || chalk.dim("never")).toString().padEnd(22) +
              chalk.dim(`${t.client_id.slice(0, 16)}...`),
          );
        }

        console.log(chalk.dim(`\n${tokens.length} token(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
