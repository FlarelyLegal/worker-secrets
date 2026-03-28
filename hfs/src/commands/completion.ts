import type { Command } from "commander";

export function registerCompletionCommands(program: Command): void {
  const completionCmd = program
    .command("completion")
    .description("Generate shell completion script");

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
      COMPREPLY=($(compgen -W "health login logout get set rm ls export import env cp versions restore token user role flag audit whoami config deploy completion" -- "$cur"))
      ;;
    token)
      COMPREPLY=($(compgen -W "register revoke ls" -- "$cur"))
      ;;
    user)
      COMPREPLY=($(compgen -W "ls add rm disable enable role" -- "$cur"))
      ;;
    role)
      COMPREPLY=($(compgen -W "ls set rm" -- "$cur"))
      ;;
    flag)
      COMPREPLY=($(compgen -W "ls get set rm" -- "$cur"))
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
`);
    });

  completionCmd
    .command("zsh")
    .description("Output zsh completion script")
    .action(() => {
      process.stdout.write(`#compdef hfs

_hfs() {
  local -a commands token_cmds config_cmds completion_cmds
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
    'versions:List version history for a secret'
    'restore:Restore a secret to a previous version'
    'token:Manage service token identities'
    'user:Manage users (admin only)'
    'role:Manage roles (admin only)'
    'flag:Manage feature flags'
    'audit:View audit log'
    'whoami:Check authentication status'
    'config:Manage CLI configuration'
    'deploy:Deploy the vault Worker to Cloudflare'
    'completion:Generate shell completions'
  )
  token_cmds=('register:Register a service token' 'revoke:Unregister a token' 'ls:List registered tokens')
  user_cmds=('ls:List all users' 'add:Add or update a user' 'rm:Remove a user' 'disable:Disable a user' 'enable:Enable a user' 'role:Change user role')
  role_cmds=('ls:List all roles' 'set:Create or update a role' 'rm:Delete a role')
  flag_cmds=('ls:List flags' 'get:Get flag value' 'set:Set a flag' 'rm:Delete a flag')
  config_cmds=('set:Set vault URL' 'show:Show current config' 'clear:Clear all config')
  deploy_cmds=('status:Show deploy state' 'reset:Clear deploy state' 'destroy:Tear down all resources' 'logs:Tail live Worker logs')
  completion_cmds=('bash:Output bash completions' 'zsh:Output zsh completions')

  case "$words[2]" in
    token) _describe 'token commands' token_cmds ;;
    user) _describe 'user commands' user_cmds ;;
    role) _describe 'role commands' role_cmds ;;
    flag) _describe 'flag commands' flag_cmds ;;
    config) _describe 'config commands' config_cmds ;;
    deploy) _describe 'deploy commands' deploy_cmds ;;
    completion) _describe 'completion commands' completion_cmds ;;
    *) _describe 'hfs commands' commands ;;
  esac
}

compdef _hfs hfs
`);
    });
}
