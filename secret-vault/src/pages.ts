const STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #fafafa; --surface: #fff; --border: #e5e5e5;
      --text: #171717; --muted: #737373; --accent: #f97316; --green: #22c55e;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0a0a0a; --surface: #141414; --border: #262626; --text: #ededed; --muted: #888; }
    }
    body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }
`;

function favicon(initial: string): string {
  return `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${initial}</text></svg>" />`;
}

export function landingPage(
  brand: string,
  origin: string,
  repoUrl?: string,
  packageName?: string,
): string {
  const repo = repoUrl || "https://github.com/FlarelyLegal/worker-secrets";
  const pkg = packageName || "@FlarelyLegal/hfs-cli";
  const initial = brand.charAt(0).toUpperCase();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand}</title>
  ${favicon(initial)}
  <style>${STYLES}
    .page { max-width: 720px; margin: 0 auto; padding: 5rem 2rem 3rem; }
    .brand { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 3rem; }
    .brand-icon { width: 28px; height: 28px; background: var(--accent); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; color: #fff; }
    .brand-name { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 1rem; }
    h1 .highlight { color: var(--accent); }
    .subtitle { font-size: 1rem; color: var(--muted); line-height: 1.7; margin-bottom: 3rem; max-width: 580px; }
    .step { display: grid; grid-template-columns: 48px 1fr; gap: 1rem; margin-bottom: 1.75rem; position: relative; }
    .step::before { content: ''; position: absolute; left: 23px; top: 48px; bottom: -1.75rem; width: 2px; background: var(--border); }
    .step:last-of-type::before { display: none; }
    .step-number { width: 48px; height: 48px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-content { padding-top: 0.125rem; }
    .step-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
    .step-desc { font-size: 0.8125rem; color: var(--muted); line-height: 1.6; margin-bottom: 0.625rem; }
    .terminal { background: #1a1a1a; border-radius: 0.625rem; padding: 1rem 1.25rem; overflow-x: auto; border: 1px solid #333; }
    .terminal code { font-family: var(--mono); font-size: 0.75rem; line-height: 1.8; color: #e0e0e0; }
    .terminal .comment { color: #555; }
    .terminal .cmd { color: #22c55e; }
    .terminal .flag { color: #f97316; }
    .terminal .output { color: #777; }
    .section-label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-top: 3rem; margin-bottom: 1.25rem; }
    .layers { display: grid; grid-template-columns: 1fr; gap: 1px; background: var(--border); border-radius: 0.75rem; overflow: hidden; margin-bottom: 2rem; }
    .layer { background: var(--surface); padding: 1rem 1.25rem; display: grid; grid-template-columns: 120px 1fr; gap: 0.75rem; align-items: baseline; }
    .layer-name { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
    .layer-desc { font-size: 0.8125rem; color: var(--muted); line-height: 1.5; }
    @media (max-width: 560px) { .layer { grid-template-columns: 1fr; gap: 0.125rem; } }
    .explanation { font-size: 0.8125rem; color: var(--muted); line-height: 1.75; margin-bottom: 2rem; padding: 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; }
    .explanation strong { color: var(--text); font-weight: 600; }
    .explanation .accent { color: var(--accent); font-weight: 600; }
    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; margin-bottom: 3rem; }
    .feat { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.875rem 1rem; }
    .feat-name { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.125rem; }
    .feat-desc { font-size: 0.6875rem; color: var(--muted); line-height: 1.4; }
    @media (max-width: 560px) { .features { grid-template-columns: 1fr; } }
    .links { display: flex; gap: 0.625rem; flex-wrap: wrap; margin-bottom: 3rem; }
    .link { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; text-decoration: none; color: var(--text); font-size: 0.75rem; font-weight: 500; transition: border-color 0.15s; }
    .link:hover { border-color: var(--accent); }
    .link .arrow { color: var(--accent); }
    .footer { padding: 1.25rem 0; border-top: 2px solid var(--accent); display: flex; align-items: center; justify-content: space-between; font-size: 0.6875rem; color: var(--muted); }
    .footer a { color: var(--muted); text-decoration: none; }
    .footer a:hover { color: var(--accent); }
    .status { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--green); }
    .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <div class="brand-icon">${initial}</div>
      <span class="brand-name">${brand}</span>
    </div>

    <h1>Your secrets. <span class="highlight">Your keys.</span> Your infrastructure.</h1>
    <p class="subtitle">A self-hosted secret manager on Cloudflare Workers. Store secrets only you can decrypt, share them with your team through roles, and revoke access with one command. No servers to run. No third parties to trust.</p>

    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Deploy to your Cloudflare account</div>
        <div class="step-desc">One command creates the Worker, D1 database, KV namespace, and Access policies. Everything runs on your account.</div>
        <div class="terminal"><code><span class="cmd">$</span> npm i -g ${pkg} --registry=https://npm.pkg.github.com<br/><span class="cmd">$</span> hfs deploy<br/><span class="output">  Deployed to ${origin}</span></code></div>
      </div>
    </div>

    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Log in and generate your encryption key</div>
        <div class="step-desc">Authenticate through your identity provider. Then generate an age identity. This key pair lives on your machine and never touches the server.</div>
        <div class="terminal"><code><span class="cmd">$</span> hfs login<br/><span class="output">  Authenticated successfully</span><br/><span class="cmd">$</span> hfs keygen <span class="flag">--register</span><br/><span class="output">  public key: age196nua3eewwvud6k858la...</span></code></div>
      </div>
    </div>

    <div class="step">
      <div class="step-number">3</div>
      <div class="step-content">
        <div class="step-title">Store secrets the server cannot read</div>
        <div class="step-desc">Private secrets are encrypted on your machine. Only your age identity can decrypt them. Team secrets are encrypted for everyone whose role grants access.</div>
        <div class="terminal"><code><span class="comment"># Only you can read this</span><br/><span class="cmd">$</span> hfs set API_KEY "sk-ant-..." <span class="flag">--private</span><br/><span class="output">  Stored API_KEY (e2e private)</span><br/><br/><span class="comment"># Shared with your team based on roles</span><br/><span class="cmd">$</span> hfs set DEPLOY_TOKEN "ghp_..." <span class="flag">--e2e</span> -t production<br/><span class="output">  encrypting for 3 recipients</span><br/><span class="output">  Stored DEPLOY_TOKEN (e2e)</span></code></div>
      </div>
    </div>

    <div class="step">
      <div class="step-number">4</div>
      <div class="step-content">
        <div class="step-title">Use everywhere. Revoke instantly.</div>
        <div class="step-desc">Load secrets into your shell, CI pipelines, or config files. When someone leaves, remove them and rewrap. Their key is excluded from every secret.</div>
        <div class="terminal"><code><span class="cmd">$</span> eval $(hfs env -e API_KEY DB_PASSWORD)<br/><span class="cmd">$</span> hfs template .env.tpl > .env<br/><br/><span class="comment"># Someone leaves</span><br/><span class="cmd">$</span> hfs user rm alice@co.com<br/><span class="cmd">$</span> hfs rewrap <span class="flag">--all</span><br/><span class="output">  12 secret(s) rewrapped</span></code></div>
      </div>
    </div>

    <div class="section-label">What protects your secrets</div>

    <div class="layers">
      <div class="layer"><span class="layer-name">End-to-end</span><span class="layer-desc">age encryption on your machine. Private or team-shared. The server stores ciphertext it cannot decrypt.</span></div>
      <div class="layer"><span class="layer-name">Envelope</span><span class="layer-desc">Each secret gets its own AES-256-GCM data encryption key, wrapped by a master key. Key rotation without re-encrypting data.</span></div>
      <div class="layer"><span class="layer-name">Integrity</span><span class="layer-desc">HMAC-SHA256 binds every secret to its key name and encryption keys. Tampering is detectable at rest.</span></div>
      <div class="layer"><span class="layer-name">Access</span><span class="layer-desc">Cloudflare Access at the edge. JWT validation in the Worker. RBAC with tag-level restrictions. Hardware keys supported.</span></div>
      <div class="layer"><span class="layer-name">Audit</span><span class="layer-desc">Every operation logged. SHA-256 hash-chained. Verifiable with the CLI. Webhook support for Slack and SIEM.</span></div>
    </div>

    <div class="explanation">
      When you store a secret with <strong>--private</strong>, it is encrypted with your age key on your machine, then envelope-encrypted with a per-secret key on the server, then bound with HMAC. Three layers. The server holds ciphertext inside ciphertext.<br/><br/>
      When you store with <strong>--e2e</strong>, the CLI asks the server who has access based on roles and tags, encrypts for all of them, and sends the result. <span class="accent">Revoke a user, rewrap, and their key is not included.</span> New team members run <strong>hfs keygen --register</strong> and they are included on the next encrypt.
    </div>

    <div class="section-label">Also built in</div>

    <div class="features">
      <div class="feat"><div class="feat-name">Burn after reading</div><div class="feat-desc">One-time secrets that delete after first read.</div></div>
      <div class="feat"><div class="feat-name">Geo-fencing</div><div class="feat-desc">Restrict access by country. Only on Cloudflare.</div></div>
      <div class="feat"><div class="feat-name">23 feature flags</div><div class="feat-desc">Runtime control. No redeploy needed.</div></div>
      <div class="feat"><div class="feat-name">Version history</div><div class="feat-desc">Diff, restore, and track every change.</div></div>
      <div class="feat"><div class="feat-name">Config templates</div><div class="feat-desc">hfs template .env.tpl > .env</div></div>
      <div class="feat"><div class="feat-name">GitHub Action</div><div class="feat-desc">Fetch secrets into CI workflows. Masked in logs.</div></div>
      <div class="feat"><div class="feat-name">Auto-provisioning</div><div class="feat-desc">Pass Access, get a role. No admin needed.</div></div>
      <div class="feat"><div class="feat-name">Open source</div><div class="feat-desc">MIT license. Run it, fork it, audit it.</div></div>
    </div>

    <div class="links">
      <a class="link" href="/doc">API Reference <span class="arrow">&#8594;</span></a>
      <a class="link" href="/doc/json">OpenAPI Spec <span class="arrow">&#8594;</span></a>
      <a class="link" href="/health">Health <span class="arrow">&#8594;</span></a>
      <a class="link" href="${repo}" target="_blank" rel="noopener">GitHub <span class="arrow">&#8594;</span></a>
      <a class="link" href="${repo}/releases/latest" target="_blank" rel="noopener">Install CLI <span class="arrow">&#8594;</span></a>
    </div>

    <div class="footer">
      <span>by <a href="https://homeflare.dev">The HomeFlare Project</a> &middot; Powered by Cloudflare Workers</span>
      <span class="status">Healthy</span>
    </div>
  </div>
</body>
</html>`;
}

interface HealthData {
  status: string;
  database: string;
  kv: string;
  version: string;
  region: string;
  maintenance: boolean;
  read_only: boolean;
  timestamp: string;
}

export function healthPage(brand: string, data: HealthData): string {
  const allOk = data.database === "ok" && data.kv === "ok";
  const initial = brand.charAt(0).toUpperCase();
  const ok = (v: string) => (v === "ok" ? "ok" : "fail");
  const flag = (v: boolean, label: string) =>
    v ? `<span class="flag-on">${label}: on</span>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand} - Health</title>
  ${favicon(initial)}
  <style>${STYLES}
    body { display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .terminal { max-width: 480px; width: 100%; background: #1a1a1a; border-radius: 0.75rem; overflow: hidden; border: 1px solid #333; }
    .terminal-bar { display: flex; align-items: center; gap: 6px; padding: 0.75rem 1rem; border-bottom: 1px solid #333; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot.r { background: #ff5f57; }
    .dot.y { background: #febc2e; }
    .dot.g { background: #28c840; }
    .terminal-title { margin-left: auto; font-family: var(--mono); font-size: 0.6875rem; color: #666; }
    .terminal-body { padding: 1.25rem 1.5rem; font-family: var(--mono); font-size: 0.8125rem; line-height: 2; color: #e0e0e0; }
    .prompt { color: var(--green); }
    .ok { color: var(--green); }
    .fail { color: #ef4444; }
    .dim { color: #555; }
    .accent { color: var(--accent); }
    .label { color: #888; display: inline-block; width: 110px; }
    .flag-on { color: var(--accent); }
    .links { padding: 0.75rem 1.5rem; border-top: 1px solid #333; display: flex; gap: 1rem; }
    .links a { font-family: var(--mono); font-size: 0.6875rem; color: var(--accent); text-decoration: none; }
    .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="terminal-bar">
      <div class="dot r"></div>
      <div class="dot y"></div>
      <div class="dot g"></div>
      <span class="terminal-title">hfs health</span>
    </div>
    <div class="terminal-body">
      <span class="prompt">$</span> hfs health<br/>
      <span class="${allOk ? "ok" : "fail"}">${allOk ? "\u2713" : "\u2717"}</span> <span class="accent">${brand}</span> ${allOk ? "is healthy" : "is degraded"}<br/>
      <br/>
      <span class="label">database</span><span class="${ok(data.database)}">${data.database}</span> <span class="dim">(D1)</span><br/>
      <span class="label">kv</span><span class="${ok(data.kv)}">${data.kv}</span> <span class="dim">(flags)</span><br/>
      ${flag(data.maintenance, "maintenance")}${data.maintenance ? "<br/>" : ""}${flag(data.read_only, "read-only")}${data.read_only ? "<br/>" : ""}
      <br/>
      <span class="dim"><span class="label">version</span>${data.version}</span><br/>
      <span class="dim"><span class="label">region</span>${data.region}</span><br/>
      <span class="dim"><span class="label">checked</span>${data.timestamp}</span><br/>
    </div>
    <div class="links">
      <a href="/">home</a>
      <a href="/doc">docs</a>
      <a href="/doc/json">openapi</a>
    </div>
  </div>
</body>
</html>`;
}
