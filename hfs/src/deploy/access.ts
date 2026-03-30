import { type CfAuth, cfApi } from "./cf-api.js";

interface AccessApp {
  id: string;
  aud: string;
  domain: string;
  name: string;
  self_hosted_domains: string[];
}

function buildProtectedDomains(domains: string[]): string[] {
  // Access protects /secrets and /tokens at the edge.
  // /whoami and /audit are protected by the Worker's auth middleware -
  // the CLI sends the JWT directly as Cf-Access-Jwt-Assertion header.
  return domains.flatMap((d) => [`${d}/secrets`, `${d}/tokens`]);
}

export async function findAccessApp(
  accountId: string,
  domains: string[],
  auth: CfAuth,
): Promise<AccessApp | null> {
  const apps = await cfApi<AccessApp[]>("GET", `/accounts/${accountId}/access/apps`, auth);
  const domainSet = new Set(domains);
  return (
    apps.find(
      (app) =>
        domainSet.has(app.domain) ||
        app.self_hosted_domains?.some((d) => {
          const base = d.split("/").slice(0, 1).join("/");
          return domainSet.has(base);
        }),
    ) ?? null
  );
}

export async function createAccessApp(
  accountId: string,
  domains: string[],
  brandName: string,
  auth: CfAuth,
): Promise<AccessApp> {
  const protectedDomains = buildProtectedDomains(domains);
  return cfApi<AccessApp>("POST", `/accounts/${accountId}/access/apps`, auth, {
    name: brandName,
    type: "self_hosted",
    domain: protectedDomains[0],
    self_hosted_domains: protectedDomains,
    session_duration: "24h",
    auto_redirect_to_identity: false,
  });
}

export async function updateAccessApp(
  accountId: string,
  appId: string,
  domains: string[],
  brandName: string,
  auth: CfAuth,
): Promise<AccessApp> {
  const protectedDomains = buildProtectedDomains(domains);
  return cfApi<AccessApp>("PUT", `/accounts/${accountId}/access/apps/${appId}`, auth, {
    name: brandName,
    type: "self_hosted",
    domain: protectedDomains[0],
    self_hosted_domains: protectedDomains,
    session_duration: "24h",
    auto_redirect_to_identity: false,
  });
}

export async function deleteAccessApp(
  accountId: string,
  appId: string,
  auth: CfAuth,
): Promise<void> {
  await cfApi("DELETE", `/accounts/${accountId}/access/apps/${appId}`, auth);
}

// --- Access Policies ---

interface AccessPolicy {
  id: string;
  name: string;
  decision: string;
  precedence: number;
}

export async function listAccessPolicies(
  accountId: string,
  appId: string,
  auth: CfAuth,
): Promise<AccessPolicy[]> {
  return cfApi<AccessPolicy[]>("GET", `/accounts/${accountId}/access/apps/${appId}/policies`, auth);
}

/** Create an Allow policy for the deployer's email (interactive users). */
export async function createAllowPolicy(
  accountId: string,
  appId: string,
  email: string,
  auth: CfAuth,
): Promise<AccessPolicy> {
  const domain = email.split("@")[1];
  return cfApi<AccessPolicy>("POST", `/accounts/${accountId}/access/apps/${appId}/policies`, auth, {
    name: `${domain} - Allow`,
    decision: "allow",
    include: [{ email: { email } }],
    precedence: 1,
    session_duration: "168h",
  });
}

/** Create a Service Auth policy so registered service tokens can authenticate. */
export async function createServiceAuthPolicy(
  accountId: string,
  appId: string,
  auth: CfAuth,
): Promise<AccessPolicy> {
  return cfApi<AccessPolicy>("POST", `/accounts/${accountId}/access/apps/${appId}/policies`, auth, {
    name: "Service Tokens",
    decision: "non_identity",
    include: [{ any_valid_service_token: {} }],
    precedence: 2,
  });
}
