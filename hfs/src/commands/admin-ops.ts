import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage, readStdin } from "../helpers.js";

export function registerAdminOpsCommands(program: Command): void {
  program
    .command("re-encrypt")
    .description("Migrate legacy secrets to envelope encryption (admin only)")
    .option("-f, --force", "Skip confirmation")
    .action(async (opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          const ok = await confirm(
            "Re-encrypt all legacy secrets with envelope encryption? This is safe but irreversible.",
          );
          if (!ok) return;
        }
        const result = await client().reEncrypt();
        console.log(
          `${chalk.green("✓")} ${result.migrated} migrated, ${result.skipped} skipped (already envelope-encrypted)`,
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("rotate-key [new-key]")
    .description("Re-wrap all DEKs with a new master key (admin only)")
    .option("-f, --force", "Skip confirmation")
    .option("--stdin", "Read new key from stdin (avoids shell history)")
    .action(async (newKeyArg: string | undefined, opts: { force?: boolean; stdin?: boolean }) => {
      try {
        let newKey: string;
        if (opts.stdin || (!newKeyArg && !process.stdin.isTTY)) {
          newKey = (await readStdin()).trim();
        } else if (newKeyArg) {
          newKey = newKeyArg;
        } else {
          die(
            "Provide a new key via --stdin or as an argument.\n  echo $NEW_KEY | hfs rotate-key --stdin",
          );
        }
        if (!/^[0-9a-fA-F]{64}$/.test(newKey)) {
          die("New key must be 64 hex characters (32 bytes). Generate with: npm run generate-keys");
        }
        if (!opts.force) {
          const ok = await confirm(
            `Rotate master key? After this, update ENCRYPTION_KEY in Wrangler secrets to the new key.\n${chalk.yellow("WARNING: Legacy secrets without DEK will NOT be rotated - run re-encrypt first.")}`,
          );
          if (!ok) return;
        }
        const result = await client().rotateKey(newKey);
        console.log(`${chalk.green("✓")} ${result.rotated} secrets rotated`);
        if (result.legacy > 0) {
          console.log(
            chalk.yellow(
              `⚠ ${result.legacy} legacy secrets skipped - run ${chalk.bold("hfs re-encrypt")} first`,
            ),
          );
        }
        console.log(chalk.dim("\nNext: update ENCRYPTION_KEY in Wrangler secrets to the new key"));
        console.log(chalk.dim("  wrangler secret put ENCRYPTION_KEY"));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  program
    .command("audit-verify")
    .description("Verify audit log hash chain integrity")
    .option("-n, --limit <n>", "Number of entries to verify", "1000")
    .action(async (opts: { limit: string }) => {
      try {
        const entries = await client().audit({ limit: parseInt(opts.limit, 10) });

        if (entries.length === 0) {
          console.log(chalk.dim("No audit entries to verify."));
          return;
        }

        // Entries come newest-first, reverse for chain verification
        const sorted = [...entries].reverse();
        let broken = 0;
        let verified = 0;
        let noHash = 0;

        for (let i = 0; i < sorted.length; i++) {
          const entry = sorted[i];
          if (!entry.prev_hash) {
            noHash++;
            continue;
          }

          // Compute expected hash: SHA-256 of "prev_id|prev_hash|timestamp|method|identity|action|key"
          const prev = i > 0 ? sorted[i - 1] : null;
          const prevId = prev?.id ?? 0;
          const prevHash = prev?.prev_hash ?? "genesis";
          const method = entry.method;
          const chainInput = `${prevId}|${prevHash}|${entry.timestamp}|${method}|${entry.identity}|${entry.action}|${entry.secret_key ?? ""}`;

          const hashBuf = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(chainInput),
          );
          const expected = [...new Uint8Array(hashBuf)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          if (expected === entry.prev_hash) {
            verified++;
          } else {
            broken++;
            console.log(
              chalk.red(
                `✗ Chain broken at entry #${entry.id} (${entry.timestamp} ${entry.action})`,
              ),
            );
          }
        }

        if (broken === 0) {
          console.log(
            `${chalk.green("✓")} Audit chain intact - ${verified} verified, ${noHash} pre-chain entries`,
          );
        } else {
          console.log(
            chalk.red(
              `\n✗ ${broken} broken link(s) detected - audit log may have been tampered with`,
            ),
          );
          process.exit(1);
        }
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
