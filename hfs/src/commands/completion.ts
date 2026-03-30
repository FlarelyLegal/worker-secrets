import type { Command } from "commander";

export function registerCompletionCommands(program: Command): void {
  const completionCmd = program
    .command("completion")
    .description('Generate shell completion script (eval "$(hfs completion bash)")');

  completionCmd
    .command("bash")
    .description("Output bash completion script")
    .action(() => {
      process.stdout.write(`_hfs_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    hfs)
      COMPREPLY=($(compgen -W "health login logout get set rm ls export import env cp diff versions restore rewrap re-encrypt rotate-key audit-verify audit token user role flag whoami config deploy keygen pubkey expiring scan profile template completion" -- "$cur"))
      ;;
    token)
      COMPREPLY=($(compgen -W "register revoke ls" -- "$cur"))
      ;;
    user)
      COMPREPLY=($(compgen -W "ls add rm disable enable role" -- "$cur"))
      ;;
    role)
      COMPREPLY=($(compgen -W "ls set rm policy" -- "$cur"))
      ;;
    policy)
      COMPREPLY=($(compgen -W "ls add rm" -- "$cur"))
      ;;
    flag)
      COMPREPLY=($(compgen -W "ls get set rm" -- "$cur"))
      ;;
    audit)
      COMPREPLY=($(compgen -W "log consumers" -- "$cur"))
      ;;
    profile)
      COMPREPLY=($(compgen -W "ls show env diff" -- "$cur"))
      ;;
    config)
      COMPREPLY=($(compgen -W "set show clear" -- "$cur"))
      ;;
    deploy)
      COMPREPLY=($(compgen -W "status reset destroy logs" -- "$cur"))
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
      ;;
  esac
}
complete -F _hfs_completions hfs
complete -F _hfs_completions homeflare
`);
    });

  completionCmd
    .command("zsh")
    .description("Output zsh completion script")
    .action(() => {
      process.stdout.write(`#compdef hfs homeflare

_hfs() {
  local -a commands
  commands=(
    'health:Check if the vault is reachable'
    'login:Authenticate via cloudflared'
    'logout:Clear stored session token'
    'get:Get a decrypted secret'
    'set:Store a secret'
    'rm:Delete a secret'
    'ls:List all secret keys'
    'export:Export all secrets as JSON'
    'import:Import secrets from JSON file'
    'env:Output secrets as KEY=value for shell'
    'cp:Copy or move a secret'
    'diff:Compare current value with a version'
    'versions:List version history for a secret'
    'restore:Restore a secret to a previous version'
    'rewrap:Re-encrypt e2e secrets for current recipients'
    're-encrypt:Migrate legacy secrets to envelope encryption'
    'rotate-key:Re-wrap DEKs with a new master key'
    'audit-verify:Verify audit log hash chain'
    'audit:View audit log or consumers'
    'token:Manage service token identities'
    'user:Manage users (admin only)'
    'role:Manage roles (admin only)'
    'flag:Manage feature flags'
    'whoami:Check authentication status'
    'config:Manage CLI configuration'
    'deploy:Deploy the vault Worker to Cloudflare'
    'keygen:Generate age identity and register public key'
    'pubkey:Show your age public key'
    'expiring:List secrets expiring within a time window'
    'scan:Scan for hardcoded secrets in .env files'
    'profile:Manage environment profiles by tag'
    'template:Render template files with vault secrets'
    'completion:Generate shell completions'
  )

  local -a token_cmds user_cmds role_cmds policy_cmds flag_cmds audit_cmds profile_cmds config_cmds deploy_cmds completion_cmds
  token_cmds=('register:Register a service token' 'revoke:Unregister a token' 'ls:List registered tokens')
  user_cmds=('ls:List all users' 'add:Add or update a user' 'rm:Remove a user' 'disable:Disable a user' 'enable:Enable a user' 'role:Change user role')
  role_cmds=('ls:List all roles' 'set:Create or update a role' 'rm:Delete a role' 'policy:Manage role policies')
  policy_cmds=('ls:List policies' 'add:Add a policy rule' 'rm:Remove a policy rule')
  flag_cmds=('ls:List flags' 'get:Get flag value' 'set:Set a flag' 'rm:Delete a flag')
  audit_cmds=('log:View audit log entries' 'consumers:Show who accessed a secret')
  profile_cmds=('ls:List profiles' 'show:Show secrets in a profile' 'env:Export profile as shell vars' 'diff:Compare two profiles')
  config_cmds=('set:Set vault URL' 'show:Show current config' 'clear:Clear all config')
  deploy_cmds=('status:Show deploy state' 'reset:Clear deploy state' 'destroy:Tear down all resources' 'logs:Tail live Worker logs')
  completion_cmds=('bash:Output bash completions' 'zsh:Output zsh completions')

  case "$words[2]" in
    token) _describe 'token commands' token_cmds ;;
    user) _describe 'user commands' user_cmds ;;
    role)
      case "$words[3]" in
        policy) _describe 'policy commands' policy_cmds ;;
        *) _describe 'role commands' role_cmds ;;
      esac ;;
    flag) _describe 'flag commands' flag_cmds ;;
    audit) _describe 'audit commands' audit_cmds ;;
    profile) _describe 'profile commands' profile_cmds ;;
    config) _describe 'config commands' config_cmds ;;
    deploy) _describe 'deploy commands' deploy_cmds ;;
    completion) _describe 'completion commands' completion_cmds ;;
    *) _describe 'hfs commands' commands ;;
  esac
}

compdef _hfs hfs
compdef _hfs homeflare
`);
    });
}
