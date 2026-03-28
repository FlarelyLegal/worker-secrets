import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage } from "../helpers.js";

export function registerRoleCommands(program: Command) {
  const role = program.command("role").description("Manage roles (admin only)");

  role
    .command("ls")
    .description("List all roles")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const roles = await client().listRoles();
        if (opts.json) {
          console.log(JSON.stringify(roles, null, 2));
          return;
        }
        if (roles.length === 0) {
          console.log(chalk.dim("No roles."));
          return;
        }
        const header = `${"NAME".padEnd(16)} ${"SCOPES".padEnd(24)} DESCRIPTION`;
        console.log(header);
        for (const r of roles) {
          console.log(
            `${r.name.padEnd(16)} ${r.scopes.padEnd(24)} ${r.description || chalk.dim("—")}`,
          );
        }
        console.log(chalk.dim(`\n${roles.length} role(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  role
    .command("set <name> <scopes>")
    .description("Create or update a role (scopes: read,write,delete or *)")
    .option("-d, --description <desc>", "Role description")
    .action(async (name: string, scopes: string, opts: { description?: string }) => {
      try {
        await client().setRole(name, scopes, opts.description);
        console.log(`${chalk.green("✓")} Role ${chalk.bold(name)} → ${chalk.bold(scopes)}`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  role
    .command("rm <name>")
    .description("Delete a role (must have no users or tokens assigned)")
    .option("-f, --force", "Skip confirmation")
    .action(async (name: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          const ok = await confirm(`Delete role ${name}?`);
          if (!ok) return;
        }
        await client().deleteRole(name);
        console.log(`${chalk.green("✓")} Role ${chalk.bold(name)} deleted`);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
