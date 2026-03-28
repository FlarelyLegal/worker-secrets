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
    body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
`;

function favicon(initial: string): string {
  return `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f97316'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='60' fill='white'>${initial}</text></svg>" />`;
}

export function landingPage(brand: string, origin: string): string {
  const initial = brand.charAt(0).toUpperCase();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand}</title>
  ${favicon(initial)}
  <style>${STYLES}
    .page { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; max-width: 920px; width: 100%; }
    @media (max-width: 720px) { .page { grid-template-columns: 1fr; } }
    .brand { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .brand-icon { width: 28px; height: 28px; background: var(--accent); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; color: #fff; }
    .brand-name { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; margin-bottom: 0.75rem; }
    .desc { color: var(--muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .links { display: flex; flex-direction: column; gap: 0.5rem; }
    .link { display: flex; align-items: center; justify-content: space-between; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; text-decoration: none; color: var(--text); transition: border-color 0.15s; }
    .link:hover { border-color: var(--muted); }
    .link-label { font-size: 0.8125rem; font-weight: 500; }
    .link-path { font-family: var(--mono); font-size: 0.6875rem; color: var(--muted); }
    .link-arrow { color: var(--muted); font-size: 0.875rem; }
    .footer { grid-column: 1 / -1; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .footer-text { font-size: 0.6875rem; color: var(--muted); }
    .status { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.6875rem; color: var(--green); }
    .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .right { padding-top: 3.75rem; }
    h2 { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
    .features { display: flex; flex-direction: column; gap: 0.5rem; }
    .feature { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; }
    .feature-title { font-size: 0.8125rem; font-weight: 500; margin-bottom: 0.25rem; }
    .feature-desc { font-size: 0.75rem; color: var(--muted); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="page">
    <div class="left">
      <div class="brand">
        <div class="brand-icon">${initial}</div>
        <span class="brand-name">${brand}</span>
      </div>
      <p class="desc">Self-hosted secret vault that runs on your own Cloudflare account. Store API keys, tokens, certificates, and credentials with a CLI or REST API. Protected by Cloudflare Access, supporting any identity provider, passkeys, YubiKeys, OTP, and hardware security keys. Like Vaultwarden, but on the edge.</p>
      <div class="links">
        <a class="link" href="/doc">
          <div><div class="link-label">API Reference</div><div class="link-path">${origin}/doc</div></div>
          <span class="link-arrow">\u2192</span>
        </a>
        <a class="link" href="/doc/json">
          <div><div class="link-label">OpenAPI Spec</div><div class="link-path">${origin}/doc/json</div></div>
          <span class="link-arrow">\u2192</span>
        </a>
        <a class="link" href="/health">
          <div><div class="link-label">Health Check</div><div class="link-path">${origin}/health</div></div>
          <span class="link-arrow">\u2192</span>
        </a>
      </div>
    </div>
    <div class="right">
      <h2>Security</h2>
      <div class="features">
        <div class="feature">
          <div class="feature-title">Encryption at rest</div>
          <div class="feature-desc">AES-256-GCM with a unique random IV per secret. Encryption key stored as a Worker secret, never in the database.</div>
        </div>
        <div class="feature">
          <div class="feature-title">Dual authentication</div>
          <div class="feature-desc">Interactive sessions via your IdP with hardware keys (passkeys, YubiKeys). Service tokens with named identities and scoped permissions for CI and other Workers.</div>
        </div>
        <div class="feature">
          <div class="feature-title">Audit logging</div>
          <div class="feature-desc">Every operation recorded with identity, action, secret key, IP, and user agent. Indexed for fast queries by secret or action type.</div>
        </div>
        <div class="feature">
          <div class="feature-title">Token registration</div>
          <div class="feature-desc">Service tokens must be registered with a name and granular permissions before access is granted. Unregistered tokens are rejected.</div>
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-text">by <a href="https://homeflare.dev" style="color:var(--muted);text-decoration:none;">The HomeFlare Project</a> \u00b7 Powered by Cloudflare Workers</span>
      <span class="status">Healthy</span>
    </div>
  </div>
</body>
</html>`;
}

export function healthPage(brand: string): string {
  const initial = brand.charAt(0).toUpperCase();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand} - Health</title>
  ${favicon(initial)}
  <style>${STYLES}
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; max-width: 380px; width: 100%; text-align: center; }
    .icon { width: 48px; height: 48px; background: var(--green); border-radius: 50%; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 24px; height: 24px; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    .status { color: var(--green); font-weight: 600; font-size: 0.875rem; margin-bottom: 1rem; }
    .meta { font-size: 0.75rem; color: var(--muted); }
    .meta span { display: block; margin-top: 0.25rem; }
    a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon"><svg fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <h1>${brand}</h1>
    <div class="status">All systems healthy</div>
    <div class="meta">
      <span>${new Date().toISOString()}</span>
      <span><a href="/">Home</a> \u00b7 <a href="/doc">API Docs</a></span>
    </div>
  </div>
</body>
</html>`;
}
