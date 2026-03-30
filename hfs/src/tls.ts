import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import tls from "node:tls";
import Conf from "conf";
import { Agent, setGlobalDispatcher } from "undici";

// Well-known WARP CA paths
const WARP_CA_PATHS = [
  "/Library/Application Support/Cloudflare/installed_cert.pem", // macOS
  "/usr/local/share/ca-certificates/Cloudflare_CA.crt", // Linux
  "/etc/ssl/certs/Cloudflare_CA.pem", // Linux alt
];

interface CaCertResult {
  path: string;
  source: "env" | "config" | "auto-detected";
}

export function resolveCaCert(): CaCertResult | null {
  // 1. Environment variable
  const envPath = process.env.HFS_CA_CERT;
  if (envPath && existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    if (content.includes("-----BEGIN CERTIFICATE-----")) {
      return { path: envPath, source: "env" };
    }
  }

  // 2. Config setting
  const config = new Conf<{ caCert?: string }>({ projectName: "hfs" });
  const configPath = config.get("caCert");
  if (configPath && existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    if (content.includes("-----BEGIN CERTIFICATE-----")) {
      return { path: configPath, source: "config" };
    }
  }

  // 3. Auto-detect WARP CA
  for (const p of WARP_CA_PATHS) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8");
      if (content.includes("-----BEGIN CERTIFICATE-----")) {
        return { path: p, source: "auto-detected" };
      }
    }
  }

  return null;
}

export function initTls(): void {
  // Skip if NODE_EXTRA_CA_CERTS is already set (handled by Node at startup)
  if (process.env.NODE_EXTRA_CA_CERTS) return;

  const cert = resolveCaCert();
  if (!cert) return;

  try {
    const customCa = readFileSync(cert.path, "utf-8");
    const ca = [...tls.rootCertificates, customCa];
    setGlobalDispatcher(new Agent({ connect: { ca } }));
  } catch {
    // Silent failure - fall back to system defaults
  }
}

/** Compute SHA-256 fingerprint of the DER-encoded cert from a PEM file. */
export function computeCaFingerprint(): string | null {
  const cert = resolveCaCert();
  if (!cert) return null;
  try {
    const pem = readFileSync(cert.path, "utf-8");
    // Extract first certificate's DER bytes from PEM
    const match = pem.match(/-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/);
    if (!match) return null;
    const der = Buffer.from(match[1].replace(/\s/g, ""), "base64");
    return createHash("sha256").update(der).digest("hex");
  } catch {
    return null;
  }
}

/** Compute a ZT challenge-response for the current minute. */
export function computeZtResponse(): {
  response: string;
  timestamp: string;
} | null {
  const fp = computeCaFingerprint();
  if (!fp) return null;
  const timestamp = Math.floor(Date.now() / 60000).toString();
  const response = createHmac("sha256", fp).update(timestamp).digest("hex");
  return { response, timestamp };
}

export function getCaCertStatus(): { active: boolean; path?: string; source?: string } {
  if (process.env.NODE_EXTRA_CA_CERTS) {
    return { active: true, path: process.env.NODE_EXTRA_CA_CERTS, source: "NODE_EXTRA_CA_CERTS" };
  }
  const cert = resolveCaCert();
  if (cert) return { active: true, ...cert };
  return { active: false };
}
