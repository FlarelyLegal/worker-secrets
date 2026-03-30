# CLI patterns

Source: `hfs/src/commands/`, `hfs/src/helpers.ts`

## Auth resolution

Source: `hfs/src/config.ts`

```typescript
type AuthMode =
  | { type: "jwt"; url: string; jwt: string }
  | { type: "service_token"; url: string; clientId: string; clientSecret: string };
```

`resolveAuth()` picks one mode with no fallback:
- If `HFS_CLIENT_ID` + `HFS_CLIENT_SECRET` env vars are set → service token
- If only one is set → hard error
- Otherwise → interactive JWT from `hfs login` (must exist and not be expired)

## Output conventions

- Success: `chalk.green("✓") + " message"`
- Error: `die(msg)` → `chalk.red("error: " + msg)` + exit 1
- Labels: `chalk.dim("label:  ") + chalk.bold(value)`
- Tables: manual padding with `.padEnd()`, dim header row
- Empty state: `chalk.dim("No items.")`

## Common options

- `-q, --quiet` - print only the raw value (for piping)
- `-j, --json` - output as JSON
- `-f, --force` - skip confirmation prompt
- `-n, --limit <n>` - limit results
- `-d, --description <desc>` - attach a description

## Confirmation prompt

```typescript
async function confirm(message: string): Promise<boolean> {
  // readline-based, returns true on "y", false otherwise
}
```

Used before destructive actions (`rm`, `token revoke`, `config clear`).

## Reading input

- `--from-stdin` → `readStdin()` (collects all stdin chunks)
- `--from-file <path>` → `readFileSync(path, "utf-8")`
- Positional argument for inline values

## Subcommand groups

```typescript
const parentCmd = program.command("parent").description("...");
parentCmd.command("child <arg>").action(async (arg) => { ... });
```

Existing groups: `config` (set, show, clear), `token` (register, revoke, ls).
