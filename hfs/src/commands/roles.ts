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
        const header = `${"NAME".padEnd(16)} ${"SCOPES".padEnd(18)} ${"TAGS".padEnd(18)} DESCRIPTION`;
        console.log(header);
        for (const r of roles) {
          const tags = r.allowed_tags || chalk.dim("all");
          console.log(
            `${r.name.padEnd(16)} ${r.scopes.padEnd(18)} ${tags.toString().padEnd(18)} ${r.description || chalk.dim(" - ")}`,
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
    .option("--allowed-tags <tags>", "Restrict access to secrets with these tags (comma-separated)")
    .action(
      async (
        name: string,
        scopes: string,
        opts: { description?: string; allowedTags?: string },
      ) => {
        try {
          await client().setRole(name, scopes, opts.description, opts.allowedTags);
          console.log(`${chalk.green("✓")} Role ${chalk.bold(name)} → ${chalk.bold(scopes)}`);
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );

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

  // --- Policy subcommands ---

  const policy = role.command("policy").description("Manage role policies (fine-grained RBAC)");

  policy
    .command("ls <role>")
    .description("List policies for a role")
    .option("-j, --json", "Output as JSON")
    .action(async (roleName: string, opts: { json?: boolean }) => {
      try {
        const policies = await client().listPolicies(roleName);
        if (opts.json) {
          console.log(JSON.stringify(policies, null, 2));
          return;
        }
        if (policies.length === 0) {
          console.log(chalk.dim("No policies (using role-level scopes/tags)."));
          return;
        }
        const header = `${"ID".padEnd(6)} ${"SCOPES".padEnd(18)} ${"TAGS".padEnd(20)} DESCRIPTION`;
        console.log(header);
        for (const p of policies) {
          const tags = p.tags || chalk.dim("all");
          console.log(
            `${String(p.id).padEnd(6)} ${p.scopes.padEnd(18)} ${tags.toString().padEnd(20)} ${p.description || chalk.dim(" - ")}`,
          );
        }
        console.log(chalk.dim(`\n${policies.length} policy(ies)`));
      } catch (e) {
        die(errorMessage(e));
      }
    });

  policy
    .command("add <role> <scopes>")
    .description("Add a policy rule to a role")
    .option("-t, --tags <tags>", "Restrict to these tags (comma-separated)")
    .option("-d, --description <desc>", "Policy description")
    .action(
      async (roleName: string, scopes: string, opts: { tags?: string; description?: string }) => {
        try {
          // Fetch existing policies, append new one
          const existing = await client().listPolicies(roleName);
          const policies = [
            ...existing.map((p) => ({
              scopes: p.scopes,
              tags: p.tags,
              description: p.description,
            })),
            { scopes, tags: opts.tags || "", description: opts.description || "" },
          ];
          await client().setPolicies(roleName, policies);
          console.log(
            `${chalk.green("✓")} Added policy to ${chalk.bold(roleName)}: ${scopes}${opts.tags ? ` (tags: ${opts.tags})` : ""}`,
          );
        } catch (e) {
          die(errorMessage(e));
        }
      },
    );

  policy
    .command("rm <role> <id>")
    .description("Remove a policy rule by ID")
    .option("-f, --force", "Skip confirmation")
    .action(async (roleName: string, id: string, opts: { force?: boolean }) => {
      try {
        const existing = await client().listPolicies(roleName);
        const target = existing.find((p) => p.id === parseInt(id, 10));
        if (!target) die(`Policy #${id} not found on role ${roleName}`);
        if (!opts.force) {
          const ok = await confirm(
            `Remove policy #${id} (${target?.scopes} on ${target?.tags || "all tags"})?`,
          );
          if (!ok) return;
        }
        const remaining = existing
          .filter((p) => p.id !== parseInt(id, 10))
          .map((p) => ({ scopes: p.scopes, tags: p.tags, description: p.description }));
        if (remaining.length === 0) {
          die("Cannot remove the last policy. Use `hfs role set` to reset the role instead.");
        }
        await client().setPolicies(roleName, remaining);
        console.log(`${chalk.green("✓")} Removed policy #${id} from ${chalk.bold(roleName)}`);
      } catch (e) {
        die(errorMessage(e));
      }
    });
}
