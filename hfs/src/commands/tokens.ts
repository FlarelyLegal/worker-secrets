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
    .option("-r, --role <role>", "Assign a role (overrides scopes when set)")
    .option(
      "--secret <secret>",
      "Client secret (hashed and stored for direct auth). Prefer env var to avoid shell history",
    )
    .option("--age-key <pubkey>", "age public key for E2E encryption (e.g. age1...)")
    .action(
      async (
        clientId: string,
        opts: {
          name: string;
          description?: string;
          scopes?: string;
          role?: string;
          secret?: string;
          ageKey?: string;
        },
      ) => {
        try {
          let secretHash: string | undefined;
          if (opts.secret) {
            const encoder = new TextEncoder();
            const digest = await crypto.subtle.digest("SHA-256", encoder.encode(opts.secret));
            secretHash = [...new Uint8Array(digest)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
          }
          await client().registerToken(clientId, opts.name, {
            description: opts.description,
            scopes: opts.scopes,
            role: opts.role,
            client_secret_hash: secretHash,
            age_public_key: opts.ageKey,
          });
          console.log(
            `${chalk.green("✓")} Registered ${chalk.bold(opts.name)} (${clientId.slice(0, 12)}...)`,
          );
          if (secretHash) {
            console.log(chalk.dim("  Direct auth enabled (secret hash stored)"));
          }
          if (opts.ageKey) {
            console.log(chalk.dim(`  E2E key: ${opts.ageKey.slice(0, 20)}...`));
          }
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
            `${"NAME".padEnd(maxName + 2)}${"SCOPES".padEnd(16)}${"ROLE".padEnd(12)}${"LAST USED".padEnd(22)}CLIENT ID`,
          ),
        );

        for (const t of tokens) {
          console.log(
            chalk.bold(t.name.padEnd(maxName + 2)) +
              t.scopes.padEnd(16) +
              (t.role || chalk.dim(" - ")).toString().padEnd(12) +
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
