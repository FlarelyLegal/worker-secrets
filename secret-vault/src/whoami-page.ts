import { esc, favicon, STYLES } from "./pages.js";

interface WhoamiData {
  method: string;
  identity: string;
  name: string;
  role: string;
  scopes: string[];
  e2e: boolean;
  deviceBound: boolean;
  policies: number;
  lastLogin: string | null;
  totalSecrets: number;
  warp?: { connected: boolean; ztVerified: boolean; deviceId?: string };
}

export function whoamiPage(brand: string, data: WhoamiData): string {
  const b = esc(brand);
  const initial = "HF";
  const ok = (v: boolean) => (v ? "ok" : "dim");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${b} Who Am I | HomeFlare</title>
  ${favicon(initial)}
  <style>${STYLES}
    body { display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .terminal { max-width: 520px; width: 100%; background: #1a1a1a; border-radius: 0.75rem; overflow: hidden; border: 1px solid #333; }
    .terminal-bar { display: flex; align-items: center; gap: 6px; padding: 0.75rem 1rem; border-bottom: 1px solid #333; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot.r { background: #ff5f57; }
    .dot.y { background: #febc2e; }
    .dot.g { background: #28c840; }
    .terminal-title { margin-left: auto; font-family: var(--mono); font-size: 0.6875rem; color: #666; }
    .terminal-body { padding: 1.25rem 1.5rem; font-family: var(--mono); font-size: 0.8125rem; line-height: 2; color: #e0e0e0; }
    .prompt { color: var(--accent); }
    .ok { color: var(--green); }
    .dim { color: #555; }
    .accent { color: var(--accent); }
    .label { color: #888; display: inline-block; width: 130px; }
    .links { padding: 0.75rem 1.5rem; border-top: 1px solid #333; display: flex; gap: 1rem; }
    .links a { font-family: var(--mono); font-size: 0.6875rem; color: var(--accent); text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    .section { color: var(--accent); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <main>
  <div class="terminal" role="status" aria-label="Authentication status">
    <div class="terminal-bar" aria-hidden="true">
      <div class="dot r"></div>
      <div class="dot y"></div>
      <div class="dot g"></div>
      <span class="terminal-title">hfs whoami</span>
    </div>
    <div class="terminal-body">
      <span class="prompt">$</span> hfs whoami<br/>
      <br/>
      <span class="label">method</span><span class="accent">${esc(data.method)}</span><br/>
      <span class="label">name</span>${esc(data.name)}<br/>
      <span class="label">identity</span>${esc(data.identity)}<br/>
      <span class="label">role</span><span class="accent">${esc(data.role)}</span><br/>
      <span class="label">scopes</span>${esc(data.scopes.join(", "))}<br/>
      <span class="label">policies</span>${data.policies}<br/>
      <br/>
      <span class="section">security</span><br/>
      <span class="label">e2e</span><span class="${ok(data.e2e)}">${data.e2e ? "registered" : "not registered"}</span><br/>
      <span class="label">device bound</span><span class="${ok(data.deviceBound)}">${data.deviceBound ? "yes" : "no"}</span><br/>
      ${data.warp ? `<span class="label">warp</span><span class="${ok(data.warp.connected)}">${data.warp.connected ? "connected" : "not connected"}</span><br/>` : ""}
      ${data.warp?.ztVerified ? `<span class="label">zt verified</span><span class="ok">yes</span><br/>` : ""}
      ${data.warp?.deviceId ? `<span class="label">device id</span><span class="dim">${esc(data.warp.deviceId)}</span><br/>` : ""}
      <br/>
      <span class="section">vault</span><br/>
      <span class="label">secrets</span>${data.totalSecrets}<br/>
      ${data.lastLogin ? `<span class="label">last login</span><span class="dim">${esc(data.lastLogin)}</span><br/>` : ""}
    </div>
    <nav class="links" aria-label="Navigation">
      <a href="/">home</a>
      <a href="/health">health</a>
      <a href="/doc">docs</a>
    </nav>
  </div>
  </main>
</body>
</html>`;
}
