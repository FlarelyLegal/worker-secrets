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
      COMPREPLY=($(compgen -W "health login logout get set rm ls export import env token audit whoami config deploy completion" -- "$cur"))
      ;;
    token)
      COMPREPLY=($(compgen -W "register revoke ls" -- "$cur"))
      ;;
    config)
      COMPREPLY=($(compgen -W "set show clear" -- "$cur"))
      ;;
    deploy)
      COMPREPLY=($(compgen -W "status reset" -- "$cur"))
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
    'token:Manage service token identities'
    'audit:View audit log'
    'whoami:Check authentication status'
    'config:Manage CLI configuration'
    'deploy:Deploy the vault Worker to Cloudflare'
    'completion:Generate shell completions'
  )
  token_cmds=('register:Register a service token' 'revoke:Unregister a token' 'ls:List registered tokens')
  config_cmds=('set:Set vault URL' 'show:Show current config' 'clear:Clear all config')
  deploy_cmds=('status:Show deploy state' 'reset:Clear deploy state')
  completion_cmds=('bash:Output bash completions' 'zsh:Output zsh completions')

  case "$words[2]" in
    token) _describe 'token commands' token_cmds ;;
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
