#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { program } from "commander";
import { registerAuditCommands } from "./commands/audit.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerSecretCommands } from "./commands/secrets.js";
import { registerTokenCommands } from "./commands/tokens.js";

const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
).version;

registerAuthCommands(program);
registerSecretCommands(program);
registerTokenCommands(program);
registerAuditCommands(program);
registerConfigCommands(program);
registerDeployCommands(program);
registerCompletionCommands(program);

program
  .name("hfs")
  .description("Encrypted secret management for Cloudflare Workers")
  .version(VERSION);

program.parse();
