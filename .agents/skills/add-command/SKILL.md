---
name: add-command
description: Add a new CLI command to the hfs tool. Use when adding user-facing commands, subcommands, or flags to the CLI.
---

# Add an hfs CLI command

## FILES

- `hfs/src/commands/` — Command modules (`auth.ts`, `secrets.ts`, `tokens.ts`, `audit.ts`, `config.ts`, `deploy.ts`, `completion.ts`)
- `hfs/src/deploy/` — Deploy phases (`state.ts`, `phases.ts`, `access.ts`, `assets.ts`, `worker.ts`, `cf-api.ts`)
- `hfs/src/client.ts` — `VaultClient` HTTP methods against the vault API
- `hfs/src/config.ts` — Auth resolution, JWT storage, config management

## CONVENTIONS

### Commands (CRITICAL)

- **ALWAYS** use `client()` helper for authenticated `VaultClient` instances
- **ALWAYS** wrap client calls in try-catch, use `die(msg)` for fatal errors
- **ALWAYS** use `confirm()` helper before destructive actions, with `-f/--force` bypass
- **NEVER** use `execSync` with string interpolation — use `execFileSync` with args array
- **NEVER** store service token credentials on disk

### Output

- Success: `chalk.green("✓") + " message"`
- Error: `die(msg)` → `chalk.red("error: ...")` + exit 1
- Labels: `chalk.dim("label:  ") + chalk.bold(value)`
- Empty state: `chalk.dim("No items.")`
- Add `-q/--quiet` for pipe-friendly output, `-j/--json` for structured output

### Pattern

#### 1. Add client method in `hfs/src/client.ts`

```typescript
async myAction(param: string): Promise<MyResponse> {
  return this.request<MyResponse>("GET", `/my-endpoint/${encodeURIComponent(param)}`);
}
```

#### 2. Add command in the appropriate `hfs/src/commands/*.ts` module

```typescript
program
  .command("my-command <arg>")
  .description("Short description")
  .action(async (arg: string) => {
    try {
      const result = await client().myAction(arg);
      console.log(`${chalk.green("✓")} Done`);
    } catch (e) {
      die(errorMessage(e));
    }
  });
```

### Versioning

- Version reads from `hfs/package.json` at runtime. Source of truth: root `VERSION` file.
- Run `npm run sync-version` after changing `VERSION`.

### Notes

- `VaultClient.health()` exists but has no CLI command — add one if needed
- Subcommand groups: `const sub = program.command("parent"); sub.command("child")`
- Existing groups: `config` (set, show, clear), `token` (register, revoke, ls)

## CHECKLIST

- [ ] Add client method in `hfs/src/client.ts` with proper types
- [ ] Add command in the appropriate `hfs/src/commands/*.ts` module
- [ ] Ensure corresponding API endpoint exists (see `add-endpoint` skill)
- [ ] Update `hfs/README.md` command table
- [ ] Build and test: `cd hfs && npm run build && node dist/cli.js <command>`

## REFERENCES

- [VaultClient interface](references/client-interface.md) — types and method signatures
- [CLI patterns](references/cli-patterns.md) — auth resolution, output conventions
