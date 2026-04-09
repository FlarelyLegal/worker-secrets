import {
  ACTION_DELETE_FLAG,
  ACTION_GET_FLAG,
  ACTION_LIST_FLAGS,
  ACTION_SET_FLAG,
} from "../constants.js";
import { NotFoundError } from "../errors.js";
import type { FlagResult, ServiceContext } from "./types.js";

type FlagType = "string" | "number" | "boolean" | "json";

/** Infer the flag type from its runtime value. */
export function inferType(value: unknown): FlagType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  return "string";
}

type StoredFlag = {
  value: unknown;
  type: FlagType;
  description: string;
  updated_by: string;
  updated_at: string;
};

// --- List ---

export async function listFlags(ctx: ServiceContext): Promise<{ flags: FlagResult[] }> {
  const list = await ctx.kv.list();
  const result: FlagResult[] = [];
  for (const key of list.keys) {
    const raw = await ctx.kv.get(key.name);
    if (raw) {
      try {
        const parsed: StoredFlag = JSON.parse(raw);
        result.push({ key: key.name, ...parsed });
      } catch {
        result.push({
          key: key.name,
          value: raw,
          type: "string",
          description: null,
          updated_by: null,
          updated_at: null,
        });
      }
    }
  }
  await ctx.auditFn(ACTION_LIST_FLAGS, null);
  return { flags: result };
}

// --- Get ---

export async function getFlagByKey(ctx: ServiceContext, key: string): Promise<FlagResult> {
  const raw = await ctx.kv.get(key);
  if (raw === null) throw new NotFoundError("Flag not found");

  let flag: FlagResult;
  try {
    const parsed: StoredFlag = JSON.parse(raw);
    flag = { key, ...parsed };
  } catch {
    flag = {
      key,
      value: raw,
      type: "string",
      description: null,
      updated_by: null,
      updated_at: null,
    };
  }

  await ctx.auditFn(ACTION_GET_FLAG, key);
  return flag;
}

// --- Set ---

export async function setFlag(
  ctx: ServiceContext,
  key: string,
  data: { value: unknown; description?: string },
): Promise<FlagResult> {
  const { value, description } = data;
  const type = inferType(value);
  const now = new Date().toISOString();

  const stored: StoredFlag = {
    value,
    type,
    description: description ?? "",
    updated_by: ctx.auth.identity,
    updated_at: now,
  };
  await ctx.kv.put(key, JSON.stringify(stored));

  await ctx.auditFn(ACTION_SET_FLAG, key);
  return { key, ...stored };
}

// --- Delete ---

export async function deleteFlag(
  ctx: ServiceContext,
  key: string,
): Promise<{ ok: true; deleted: string }> {
  await ctx.kv.delete(key);
  await ctx.auditFn(ACTION_DELETE_FLAG, key);
  return { ok: true, deleted: key };
}
