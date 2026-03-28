#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { program } from "commander";
import { registerAuditCommands } from "./commands/audit.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerFlagCommands } from "./commands/flags.js";
import { registerSecretCommands } from "./commands/secrets.js";
import { registerTokenCommands } from "./commands/tokens.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const VERSION: string = pkg.version;
const REPO: string = pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") || "";

registerAuthCommands(program);
registerSecretCommands(program);
registerTokenCommands(program);
registerFlagCommands(program);
registerAuditCommands(program);
registerConfigCommands(program);
registerDeployCommands(program);
registerCompletionCommands(program);

program
  .name("hfs")
  .description("Encrypted secret management for Cloudflare Workers")
  .version(VERSION);

program.parse();

// Non-blocking version check (only on TTY, not in pipes/CI)
if (process.stdout.isTTY && REPO) {
  const apiUrl = `${REPO.replace("github.com", "api.github.com/repos")}/releases/latest`;
  fetch(apiUrl, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.json() as Promise<{ tag_name?: string }>)
    .then((data) => {
      const latest = data.tag_name?.replace(/^v/, "");
      if (latest && latest !== VERSION) {
        console.error(`\nhfs update available: ${VERSION} → ${latest} (${REPO}/releases/latest)\n`);
      }
    })
    .catch(() => {});
}
