import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { getConfig } from "../config.js";
import { e2eEncrypt, loadRecipient } from "../e2e.js";
import { client, confirm, die, errorMessage } from "../helpers.js";

/** File patterns to scan for secrets. */
const ENV_PATTERNS = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.staging",
  ".env.production",
  ".env.test",
  ".env.example",
];

/** Regex patterns that indicate a secret value (case-insensitive key match). */
const SECRET_KEY_PATTERNS = [
  /api[_-]?key/i,
  /api[_-]?secret/i,
  /api[_-]?token/i,
  /secret[_-]?key/i,
  /access[_-]?key/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /private[_-]?key/i,
  /password/i,
  /passwd/i,
  /db[_-]?pass/i,
  /database[_-]?url/i,
  /connection[_-]?string/i,
  /encryption[_-]?key/i,
  /signing[_-]?key/i,
  /jwt[_-]?secret/i,
  /webhook[_-]?secret/i,
  /client[_-]?secret/i,
];

/** Value patterns that look like real secrets regardless of key name. */
const SECRET_VALUE_PATTERNS = [
  /^sk-[a-zA-Z0-9]{20,}/, // OpenAI / Anthropic
  /^sk-ant-[a-zA-Z0-9-]{20,}/, // Anthropic
  /^ghp_[a-zA-Z0-9]{36,}/, // GitHub PAT
  /^gho_[a-zA-Z0-9]{36,}/, // GitHub OAuth
  /^ghs_[a-zA-Z0-9]{36,}/, // GitHub App
  /^github_pat_[a-zA-Z0-9_]{20,}/, // GitHub fine-grained
  /^glpat-[a-zA-Z0-9_-]{20,}/, // GitLab PAT
  /^AKIA[A-Z0-9]{16}/, // AWS Access Key
  /^xox[bpras]-[a-zA-Z0-9-]{10,}/, // Slack tokens
  /^SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/, // SendGrid
  /^rk_live_[a-zA-Z0-9]{24,}/, // Stripe restricted
  /^sk_live_[a-zA-Z0-9]{24,}/, // Stripe secret
  /^pk_live_[a-zA-Z0-9]{24,}/, // Stripe publishable
  /^whsec_[a-zA-Z0-9]{24,}/, // Stripe webhook
  /^np_[a-zA-Z0-9_-]{20,}/, // npm token
  /^age1[a-z0-9]{58}/, // age public key
];

interface Finding {
  file: string;
  key: string;
  value: string;
  reason: "key" | "value";
  line: number;
}

function scanFile(filePath: string): Finding[] {
  const findings: Finding[] = [];
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    // Match KEY=VALUE or KEY="VALUE" or KEY='VALUE'
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    // Strip surrounding quotes
    const value = rawValue.replace(/^["']|["']$/g, "").trim();
    if (!value || value === "changeme" || value === "xxx" || value === "your-key-here") continue;

    // Check key name against secret patterns
    if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
      findings.push({ file: filePath, key, value, reason: "key", line: i + 1 });
      continue;
    }

    // Check value against known secret formats
    if (SECRET_VALUE_PATTERNS.some((p) => p.test(value))) {
      findings.push({ file: filePath, key, value, reason: "value", line: i + 1 });
    }
  }
  return findings;
}

function findEnvFiles(dir: string): string[] {
  const found: string[] = [];

  function walk(d: string, depth: number) {
    if (depth > 5) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git" || entry === "vendor" || entry === "dist")
        continue;
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (ENV_PATTERNS.includes(basename(full))) {
          found.push(full);
        }
      } catch {
        // skip unreadable
      }
    }
  }

  walk(dir, 0);
  return found;
}

export function registerScanCommands(program: Command): void {
  program
    .command("scan [dir]")
    .description("Scan for hardcoded secrets in .env files")
    .option("--dry-run", "Report findings without storing")
    .option("--private", "Store as e2e private (encrypted for only you)")
    .option("-t, --tags <tags>", "Tags to apply to imported secrets")
    .action(
      async (
        dir: string | undefined,
        opts: { dryRun?: boolean; private?: boolean; tags?: string },
      ) => {
        try {
          const scanDir = dir || process.cwd();
          console.log(chalk.dim(`Scanning ${scanDir} for .env files...`));

          const files = findEnvFiles(scanDir);
          if (files.length === 0) {
            console.log(chalk.dim("No .env files found."));
            return;
          }

          console.log(chalk.dim(`Found ${files.length} .env file(s)\n`));

          const allFindings: Finding[] = [];
          for (const f of files) {
            const findings = scanFile(f);
            allFindings.push(...findings);
          }

          if (allFindings.length === 0) {
            console.log(chalk.green("No hardcoded secrets detected."));
            return;
          }

          // Display findings
          const maxKey = Math.max(...allFindings.map((f) => f.key.length), 3);
          console.log(
            chalk.dim(`${"KEY".padEnd(maxKey + 2)}${"FILE".padEnd(30)}${"LINE".padEnd(6)}REASON`),
          );
          for (const f of allFindings) {
            const rel = relative(scanDir, f.file);
            const reason =
              f.reason === "key" ? chalk.yellow("key pattern") : chalk.red("value pattern");
            console.log(
              chalk.bold(f.key.padEnd(maxKey + 2)) +
                chalk.dim(rel.padEnd(30)) +
                chalk.dim(String(f.line).padEnd(6)) +
                reason,
            );
          }
          console.log(chalk.dim(`\n${allFindings.length} secret(s) found`));

          if (opts.dryRun) return;

          // Offer to store
          console.log();
          if (!(await confirm(`Store ${allFindings.length} secret(s) in the vault?`))) return;

          const c = client();
          let stored = 0;
          let skipped = 0;

          for (const f of allFindings) {
            try {
              let value = f.value;

              if (opts.private) {
                const ownKey = await loadRecipient(getConfig().e2eIdentity);
                value = await e2eEncrypt(value, [ownKey]);
              }

              const tags = opts.private
                ? `e2e${opts.tags ? `,${opts.tags}` : ""}`
                : opts.tags || "";

              await c.set(f.key, value, {
                description: `Imported from ${relative(scanDir, f.file)}`,
                tags,
              });
              console.log(`${chalk.green("+")} ${f.key}`);
              stored++;
            } catch (e) {
              console.log(`${chalk.red("x")} ${f.key} - ${errorMessage(e)}`);
              skipped++;
            }
          }

          console.log(chalk.dim(`\n${stored} stored, ${skipped} skipped`));
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );
}
