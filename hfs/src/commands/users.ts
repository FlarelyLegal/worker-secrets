import chalk from "chalk";
import type { Command } from "commander";
import { client, confirm, die, errorMessage } from "../helpers.js";

export function registerUserCommands(program: Command) {
  const user = program.command("user").description("Manage users (admin only)");

  user
    .command("ls")
    .description("List all users")
    .option("-j, --json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const users = await client().listUsers();
        if (opts.json) {
          console.log(JSON.stringify(users, null, 2));
          return;
        }
        if (users.length === 0) {
          console.log(chalk.dim("No users."));
          return;
        }
        const header = `${"EMAIL".padEnd(36)} ${"NAME".padEnd(20)} ${"ROLE".padEnd(10)} ${"ENABLED".padEnd(8)} LAST LOGIN`;
        console.log(header);
        for (const u of users) {
          const enabled = u.enabled ? chalk.green("yes") : chalk.red("no");
          const lastLogin = u.last_login_at || chalk.dim("never");
          console.log(
            `${u.email.padEnd(36)} ${(u.name || chalk.dim("—")).padEnd(20)} ${u.role.padEnd(10)} ${enabled.padEnd(8 + 10)} ${lastLogin}`,
          );
        }
        console.log(chalk.dim(`\n${users.length} user(s)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  user
    .command("add <email>")
    .description("Add or update a user")
    .requiredOption("-r, --role <role>", "Role to assign")
    .option("-n, --name <name>", "Display name")
    .action(async (email: string, opts: { role: string; name?: string }) => {
      try {
        await client().addUser(email, opts.role, opts.name);
        console.log(
          `${chalk.green("✓")} User ${chalk.bold(email)} added with role ${chalk.bold(opts.role)}`,
        );
      } catch (e) {
        die(errorMessage(e));
      }
    });

  user
    .command("rm <email>")
    .description("Remove a user")
    .option("-f, --force", "Skip confirmation")
    .action(async (email: string, opts: { force?: boolean }) => {
      try {
        if (!opts.force) {
          const ok = await confirm(`Remove user ${email}?`);
          if (!ok) return;
        }
        await client().deleteUser(email);
        console.log(`${chalk.green("✓")} User ${chalk.bold(email)} removed`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  user
    .command("disable <email>")
    .description("Disable a user (reject auth without deleting)")
    .action(async (email: string) => {
      try {
        await client().updateUser(email, { enabled: false });
        console.log(`${chalk.green("✓")} User ${chalk.bold(email)} disabled`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  user
    .command("enable <email>")
    .description("Re-enable a disabled user")
    .action(async (email: string) => {
      try {
        await client().updateUser(email, { enabled: true });
        console.log(`${chalk.green("✓")} User ${chalk.bold(email)} enabled`);
      } catch (e) {
        die(errorMessage(e));
      }
    });

  user
    .command("role <email> <role>")
    .description("Change a user's role")
    .action(async (email: string, role: string) => {
      try {
        await client().updateUser(email, { role });
        console.log(`${chalk.green("✓")} User ${chalk.bold(email)} → role ${chalk.bold(role)}`);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
