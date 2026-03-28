import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const WORKER_DIR = join(homedir(), ".hfs", "worker");
const STATE_FILE = join(WORKER_DIR, "deploy-state.json");

export interface DeployState {
  // Config (user-provided)
  projectName: string; // worker name, DB name prefix (default: "secret-vault")
  brandName: string; // display name in UI/API docs (default: "Secret Vault")
  accountId: string;
  email: string;
  domain: string; // primary domain
  domains: string[]; // all custom domains
  emails: string;
  teamDomain: string;
  workersDev: boolean;
  observability: boolean;

  // Phase 1: Access
  accessAppId: string;
  policyAud: string;

  // Phase 2: Assets
  databaseId: string;

  // Phase 3: Worker
  encryptionKeySet: boolean;
  deployedAt: string;
}

export function emptyState(): DeployState {
  return {
    projectName: "secret-vault",
    brandName: "Secret Vault",
    accountId: "",
    email: "",
    domain: "",
    domains: [],
    emails: "",
    teamDomain: "",
    workersDev: false,
    observability: false,
    accessAppId: "",
    policyAud: "",
    databaseId: "",
    encryptionKeySet: false,
    deployedAt: "",
  };
}

export function loadState(): DeployState {
  if (!existsSync(STATE_FILE)) return emptyState();
  return { ...emptyState(), ...JSON.parse(readFileSync(STATE_FILE, "utf-8")) };
}

export function saveState(state: DeployState): void {
  mkdirSync(WORKER_DIR, { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}
