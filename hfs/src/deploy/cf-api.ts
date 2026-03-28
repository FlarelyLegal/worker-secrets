import { execFileSync } from "node:child_process";

export interface CfAuth {
  email: string;
  apiKey: string;
}

export function resolveCfAuth(): CfAuth {
  const apiKey = process.env.CLOUDFLARE_API_KEY || process.env.CF_API_KEY;
  let email = process.env.CLOUDFLARE_EMAIL || process.env.CF_API_EMAIL;

  if (!apiKey) {
    throw new Error(
      "Cloudflare API key required. Set CLOUDFLARE_API_KEY (Global API Key from dashboard).",
    );
  }

  if (!email) {
    try {
      const output = execFileSync("npx", ["wrangler", "whoami"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = output.match(/associated with the email (\S+)/);
      if (match) email = match[1];
    } catch {
      // ignore
    }
  }

  if (!email) {
    throw new Error("Cloudflare email required. Set CLOUDFLARE_EMAIL or run `wrangler login`.");
  }

  return { email, apiKey };
}

export async function cfApi<T>(
  method: string,
  path: string,
  auth: CfAuth,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      "X-Auth-Email": auth.email,
      "X-Auth-Key": auth.apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as { success: boolean; result: T; errors: { message: string }[] };

  if (!data.success) {
    const msg = data.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudflare API error: ${msg}`);
  }

  return data.result;
}
