export const STYLES = `
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
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; }
    }
    body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }
`;

/** Escape HTML special characters to prevent injection. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function favicon(initial: string): string {
  return `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${esc(initial)}</text></svg>" />`;
}

export function landingPage(
  brand: string,
  origin: string,
  version: string,
  repoUrl?: string,
  packageName?: string,
): string {
  const repo = repoUrl || "https://github.com/FlarelyLegal/worker-secrets";
  const pkg = packageName || "@FlarelyLegal/hfs-cli";
  const b = esc(brand);
  const initial = esc(brand.charAt(0).toUpperCase());
  const o = esc(origin);
  const r = esc(repo);
  const p = esc(pkg);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${b}</title>
  <meta name="description" content="${b}: Self-hosted encrypted secret manager on Cloudflare Workers with end-to-end encryption, RBAC, and tamper-evident audit logs." />
  <meta property="og:title" content="${b}" />
  <meta property="og:description" content="Self-hosted secret manager with zero-knowledge encryption. Your secrets, your keys, your infrastructure." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${o}" />
  ${favicon(initial)}
  <style>${STYLES}
    .page { max-width: 720px; margin: 0 auto; padding: 5rem 2rem 3rem; }
    header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 3rem; }
    .brand-icon { width: 28px; height: 28px; background: var(--accent); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; color: #fff; }
    .brand-name { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 1rem; }
    h1 .highlight { color: var(--accent); }
    .subtitle { font-size: 1rem; color: var(--muted); line-height: 1.7; margin-bottom: 3rem; max-width: 580px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border-radius: 0.75rem; overflow: hidden; margin-bottom: 2rem; }
    .stat { background: var(--surface); padding: 1.25rem 1rem; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
    .stat-label { font-size: 0.625rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; }
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
    .terminal .cmd { color: var(--accent); }
    .terminal .flag { color: var(--accent); }
    .terminal .output { color: #777; }
    .section-label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-top: 3rem; margin-bottom: 1.25rem; }
    .arch-diagram { background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; margin-bottom: 2rem; }
    .arch-row { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.375rem; }
    .arch-node { padding: 0.5rem 0.875rem; border-radius: 0.375rem; font-size: 0.6875rem; font-weight: 500; text-align: center; border: 1px solid rgba(249,115,22,0.2); color: var(--text); background: rgba(249,115,22,0.03); }
    .arch-node.active { border-color: rgba(249,115,22,0.4); color: var(--accent); }
    .arch-arrow-down { text-align: center; color: var(--muted); font-size: 0.6875rem; margin: 0.25rem 0; font-family: var(--mono); }
    .explanation { font-size: 0.8125rem; color: var(--muted); line-height: 1.75; margin-bottom: 2rem; padding: 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; }
    .explanation strong { color: var(--text); font-weight: 600; }
    .explanation .accent { color: var(--accent); font-weight: 600; }
    .compare-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.8125rem; background: var(--surface); border-radius: 0.75rem; overflow: hidden; border: 1px solid var(--border); }
    .compare-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--border); font-weight: 600; }
    .compare-table th.ours { color: var(--accent); }
    .compare-table td { padding: 0.625rem 1rem; border-bottom: 1px solid var(--border); color: var(--muted); }
    .compare-table tr:last-child td { border-bottom: none; }
    .compare-table .check { color: var(--muted); }
    .compare-table .ours-check { color: var(--accent); font-weight: 600; }
    .compare-table .x { color: #ccc; }
    @media (prefers-color-scheme: dark) { .compare-table .x { color: #333; } }
    .compare-table .ours { color: var(--text); font-weight: 500; }
    .links { display: flex; gap: 0.625rem; flex-wrap: wrap; margin-bottom: 3rem; }
    .link { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; text-decoration: none; color: var(--text); font-size: 0.75rem; font-weight: 500; transition: border-color 0.15s; }
    .link:hover, .link:focus-visible { border-color: var(--accent); outline: none; }
    .link .arrow { color: var(--accent); }
    footer { padding: 1.25rem 0; border-top: 2px solid var(--accent); display: flex; align-items: center; justify-content: space-between; font-size: 0.6875rem; color: var(--muted); }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--accent); }
    @media (max-width: 560px) { .stats { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div class="brand-icon">${initial}</div>
      <span class="brand-name">${b}</span>
    </header>

    <main>
    <h1>Your secrets. <span class="highlight">Your keys.</span> Your infrastructure.</h1>
    <p class="subtitle">A self-hosted secret manager on Cloudflare Workers. Store secrets only you can decrypt, share them with your team through roles, and revoke access with one command. No servers to run. No third parties to trust.</p>

    <div class="stats">
      <div class="stat"><div class="stat-value">AES-256</div><div class="stat-label">per-secret encryption</div></div>
      <div class="stat"><div class="stat-value">E2E</div><div class="stat-label">zero-knowledge mode</div></div>
      <div class="stat"><div class="stat-value">3</div><div class="stat-label">encryption layers</div></div>
      <div class="stat"><div class="stat-value">SHA-256</div><div class="stat-label">hash-chained audit</div></div>
    </div>

    <div class="section-label">How does it compare?</div>

    <table class="compare-table">
      <thead>
        <tr>
          <th></th>
          <th class="ours">${b}</th>
          <th>HashiCorp Vault</th>
          <th>AWS Secrets Mgr</th>
          <th>Doppler</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Self-hosted</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Zero-knowledge E2E</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>No servers to run</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="check">&#10003;</td><td class="check">&#10003;</td></tr>
        <tr><td>Per-secret encryption keys</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="check">&#10003;</td><td class="x">&mdash;</td></tr>
        <tr><td>Key rotation without re-encrypting</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td><td class="x">&mdash;</td></tr>
        <tr><td>RBAC + tag restrictions</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td></tr>
        <tr><td>Hash-chained audit log</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Burn after reading</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Cloudflare WARP / Zero Trust</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Gateway-policeable CLI</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Geo-fencing</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Version history + restore</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td></tr>
        <tr><td>Runtime feature flags</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Config templates</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="x">&mdash;</td><td class="check">&#10003;</td></tr>
        <tr><td>GitHub Action</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td><td class="check">&#10003;</td></tr>
        <tr><td>Auto-provisioning</td><td class="ours-check">&#10003;</td><td class="check">&#10003;</td><td class="x">&mdash;</td><td class="check">&#10003;</td></tr>
        <tr><td>Free at any scale</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
        <tr><td>Open source</td><td class="ours-check">&#10003;</td><td class="x">&mdash;</td><td class="x">&mdash;</td><td class="x">&mdash;</td></tr>
      </tbody>
    </table>

    <div class="section-label">Get started in 4 steps</div>

    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <div class="step-title">Deploy to your Cloudflare account</div>
        <div class="step-desc">One command creates the Worker, D1 database, KV namespace, and Access policies. Everything runs on your account.</div>
        <div class="terminal"><code><span class="cmd">$</span> npm i -g ${p} --registry=https://npm.pkg.github.com<br/><span class="cmd">$</span> hfs deploy<br/><span class="output">  Deployed to ${o}</span></code></div>
      </div>
    </div>

    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <div class="step-title">Connect, log in, generate your key</div>
        <div class="step-desc">Point the CLI to your vault, authenticate through your identity provider, and generate an age identity. The key pair lives on your machine and never touches the server.</div>
        <div class="terminal"><code><span class="cmd">$</span> hfs config set --url ${o}<br/><span class="cmd">$</span> hfs login<br/><span class="output">  Authenticated successfully</span><br/><span class="cmd">$</span> hfs keygen <span class="flag">--register</span><br/><span class="output">  public key: age196nua3eewwvud6k858la...</span></code></div>
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
        <div class="terminal"><code><span class="cmd">$</span> eval $(hfs env <span class="flag">--export</span> API_KEY DB_PASSWORD)<br/><span class="cmd">$</span> hfs template .env.tpl &gt; .env<br/><br/><span class="comment"># Someone leaves</span><br/><span class="cmd">$</span> hfs user rm alice@co.com<br/><span class="cmd">$</span> hfs rewrap <span class="flag">--all</span><br/><span class="output">  12 secret(s) rewrapped</span></code></div>
      </div>
    </div>

    <div class="section-label">How your secret is protected</div>

    <div class="arch-diagram">
      <div class="arch-row">
        <div class="arch-node">hfs CLI</div>
        <div class="arch-node">REST API</div>
        <div class="arch-node">GitHub Action</div>
      </div>
      <div class="arch-arrow-down">&darr; age encrypt (e2e) &darr;</div>
      <div class="arch-row">
        <div class="arch-node active" style="min-width:380px">Cloudflare Edge &mdash; DDoS &middot; TLS &middot; Access (IdP + hardware keys)</div>
      </div>
      <div class="arch-arrow-down">&darr; JWT &darr;</div>
      <div class="arch-row">
        <div class="arch-node active" style="min-width:380px">Worker &mdash; ZT verify &rarr; DEK encrypt &rarr; KEK wrap &rarr; HMAC sign &rarr; Audit</div>
      </div>
      <div class="arch-arrow-down">&darr; ciphertext only &darr;</div>
      <div class="arch-row">
        <div class="arch-node">D1 (SQLite)</div>
        <div class="arch-node">KV (flags)</div>
      </div>
    </div>

    </main>

    <nav class="links" aria-label="Quick links">
      <a class="link" href="/doc">API Reference <span class="arrow">&#8594;</span></a>
      <a class="link" href="/doc/json">OpenAPI Spec <span class="arrow">&#8594;</span></a>
      <a class="link" href="/health">Health <span class="arrow">&#8594;</span></a>
      <a class="link" href="${r}" target="_blank" rel="noopener">GitHub <span class="arrow">&#8594;</span></a>
      <a class="link" href="${r}/releases/latest" target="_blank" rel="noopener">Install CLI <span class="arrow">&#8594;</span></a>
    </nav>

    <footer>
      <span>by <a href="https://homeflare.dev">The HomeFlare Project</a> &middot; Powered by Cloudflare Workers</span>
      <a href="/health" style="color:var(--muted);text-decoration:none">Healthy &middot; v${esc(version)}</a>
    </footer>
  </div>
</body>
</html>`;
}

// Re-export healthPage so existing imports from pages.js still work
export { healthPage } from "./health-page.js";
