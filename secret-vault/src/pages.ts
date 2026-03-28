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
    .footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .footer-text { font-size: 0.6875rem; color: var(--muted); }
    .status { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.6875rem; color: var(--green); }
    .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: var(--text); }
    .features { display: flex; flex-direction: column; gap: 1.25rem; }
    .feature { display: flex; gap: 0.75rem; }
    .feature-icon { width: 32px; height: 32px; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.875rem; }
    .feature-icon.orange { background: rgba(249,115,22,0.1); color: var(--accent); }
    .feature-icon.green { background: rgba(34,197,94,0.1); color: var(--green); }
    .feature-icon.blue { background: rgba(59,130,246,0.1); color: #3b82f6; }
    .feature-icon.purple { background: rgba(139,92,246,0.1); color: #8b5cf6; }
    .feature-title { font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.125rem; }
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
      <h1>${brand}</h1>
      <p class="desc">Encrypted secret management powered by Cloudflare Workers and D1. All secrets are encrypted at rest with AES-256-GCM. Authentication is handled through Cloudflare Access with two paths for humans and machines.</p>
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
      <div class="footer">
        <span class="footer-text">${brand} \u00b7 Powered by Cloudflare Workers</span>
        <span class="status">Healthy</span>
      </div>
    </div>
    <div class="right">
      <h2>Security architecture</h2>
      <div class="features">
        <div class="feature">
          <div class="feature-icon orange">\ud83d\udd10</div>
          <div><div class="feature-title">AES-256-GCM encryption</div><div class="feature-desc">Every secret encrypted with a unique random IV. Keys never touch the database. Encryption key stored as a Cloudflare Worker secret.</div></div>
        </div>
        <div class="feature">
          <div class="feature-icon green">\ud83d\udee1\ufe0f</div>
          <div><div class="feature-title">Dual auth via Cloudflare Access</div><div class="feature-desc">Interactive sessions with your IdP and hardware keys (passkeys, YubiKeys) for humans. Registered service tokens with scoped permissions for machines.</div></div>
        </div>
        <div class="feature">
          <div class="feature-icon blue">\ud83d\udcdd</div>
          <div><div class="feature-title">Full audit logging</div><div class="feature-desc">Every operation logged with identity, action, secret key, IP address, and user agent. Composite indexes for fast querying by secret or action.</div></div>
        </div>
        <div class="feature">
          <div class="feature-icon purple">\ud83d\udd11</div>
          <div><div class="feature-title">Scoped service tokens</div><div class="feature-desc">Each token gets a name, description, and granular permissions (read, write, delete). Unregistered tokens are rejected even with valid Access credentials.</div></div>
        </div>
      </div>
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
