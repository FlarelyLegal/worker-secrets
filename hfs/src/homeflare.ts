#!/usr/bin/env node

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const args = process.argv.slice(2);

if (args[0] === "secrets") {
  // Rewrite argv so Commander sees the subcommand args
  process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
  await import("./cli.js");
} else if (args[0] === "version" || args[0] === "--version" || args[0] === "-v") {
  console.log(pkg.version);
} else if (args[0] === "help" || args[0] === "--help" || args[0] === "-h" || !args[0]) {
  console.log(`homeflare v${pkg.version} - The HomeFlare Project CLI\n`);
  console.log("Usage: homeflare <tool> [command] [options]\n");
  console.log("Tools:");
  console.log("  secrets    Encrypted secret vault (alias: hfs)");
  console.log("\nExamples:");
  console.log('  homeflare secrets set KEY "value" --private');
  console.log("  homeflare secrets get KEY");
  console.log("  homeflare secrets ls");
  console.log("  homeflare secrets deploy");
  console.log("  homeflare secrets whoami");
  console.log(`\nhttps://github.com/HomeFlare`);
} else {
  console.error(`Unknown tool: ${args[0]}`);
  console.error("Available tools: secrets");
  console.error("Run: homeflare --help");
  process.exit(1);
}
