import { esc, favicon, STYLES } from "./pages.js";

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
  const b = esc(brand);
  const initial = "HF";
  const ok = (v: string) => (v === "ok" ? "ok" : "fail");
  const flag = (v: boolean, label: string) =>
    v ? `<span class="flag-on">${esc(label)}: on</span>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${b} Health | HomeFlare</title>
  <meta name="description" content="${b} by HomeFlare: health check — database, KV, version, and operational status." />
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
    .links a:hover, .links a:focus-visible { text-decoration: underline; outline: none; }
  </style>
</head>
<body>
  <main>
  <div class="terminal" role="status" aria-label="Health check results">
    <div class="terminal-bar" aria-hidden="true">
      <div class="dot r"></div>
      <div class="dot y"></div>
      <div class="dot g"></div>
      <span class="terminal-title">hfs health</span>
    </div>
    <div class="terminal-body">
      <span class="prompt">$</span> hfs health<br/>
      <span class="${allOk ? "ok" : "fail"}">${allOk ? "\u2713" : "\u2717"}</span> <span class="accent">${b}</span> ${allOk ? "is healthy" : "is degraded"}<br/>
      <br/>
      <span class="label">database</span><span class="${ok(data.database)}">${esc(data.database)}</span> <span class="dim">(D1)</span><br/>
      <span class="label">kv</span><span class="${ok(data.kv)}">${esc(data.kv)}</span> <span class="dim">(flags)</span><br/>
      ${flag(data.maintenance, "maintenance")}${data.maintenance ? "<br/>" : ""}${flag(data.read_only, "read-only")}${data.read_only ? "<br/>" : ""}
      <br/>
      <span class="dim"><span class="label">version</span>${esc(data.version)}</span><br/>
      <span class="dim"><span class="label">region</span>${esc(data.region)}</span><br/>
      <span class="dim"><span class="label">checked</span>${esc(data.timestamp)}</span><br/>
    </div>
    <nav class="links" aria-label="Navigation">
      <a href="/">home</a>
      <a href="/doc">docs</a>
      <a href="/doc/json">openapi</a>
    </nav>
  </div>
  </main>
</body>
</html>`;
}
