import { describe, it, expect, vi } from "vitest";
import { parseDurationMs, parseTtl, formatRelative } from "../src/duration.js";
import { interpolate } from "../src/interpolate.js";
import { toShellLine, parseTags } from "../src/helpers.js";

// ---------------------------------------------------------------------------
// duration.ts
// ---------------------------------------------------------------------------

describe("parseDurationMs", () => {
  it("parses seconds", () => {
    expect(parseDurationMs("45s")).toBe(45 * 1000);
  });

  it("parses minutes", () => {
    expect(parseDurationMs("90m")).toBe(90 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseDurationMs("12h")).toBe(12 * 60 * 60 * 1000);
  });

  it("parses days", () => {
    expect(parseDurationMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("parses weeks", () => {
    expect(parseDurationMs("2w")).toBe(2 * 7 * 24 * 60 * 60 * 1000);
  });

  it("throws on invalid unit", () => {
    expect(() => parseDurationMs("30x")).toThrow(/Invalid duration/);
  });

  it("throws on non-numeric input", () => {
    expect(() => parseDurationMs("invalid")).toThrow(/Invalid duration/);
  });

  it("throws on empty string", () => {
    expect(() => parseDurationMs("")).toThrow(/Invalid duration/);
  });
});

describe("parseTtl", () => {
  it("returns an ISO string approximately 7 days from now", () => {
    const before = Date.now();
    const result = parseTtl("7d");
    const after = Date.now();

    const ts = new Date(result).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ts).toBeGreaterThanOrEqual(before + sevenDays);
    expect(ts).toBeLessThanOrEqual(after + sevenDays);
  });
});

describe("formatRelative", () => {
  it("formats 1 second", () => {
    expect(formatRelative(1000)).toBe("1s");
  });

  it("formats 1 minute exactly", () => {
    expect(formatRelative(60000)).toBe("1m");
  });

  it("formats 1 hour exactly", () => {
    expect(formatRelative(3600000)).toBe("1h");
  });

  it("formats 1 day exactly", () => {
    expect(formatRelative(86400000)).toBe("1d");
  });

  it("formats 2 days", () => {
    expect(formatRelative(172800000)).toBe("2d");
  });

  it("uses absolute value for negative ms", () => {
    expect(formatRelative(-86400000)).toBe("1d");
  });
});

// ---------------------------------------------------------------------------
// interpolate.ts
// ---------------------------------------------------------------------------

describe("interpolate", () => {
  it("substitutes a single reference", async () => {
    const resolve = async (key: string) => (key === "A" ? "hello" : "");
    expect(await interpolate("${A}", resolve)).toBe("hello");
  });

  it("substitutes multiple references in one pass", async () => {
    const store: Record<string, string> = { A: "foo", B: "bar" };
    const resolve = async (key: string) => store[key] ?? "";
    expect(await interpolate("${A}:${B}", resolve)).toBe("foo:bar");
  });

  it("returns plain text unchanged when no refs present", async () => {
    const resolve = vi.fn(async () => "");
    expect(await interpolate("plain text", resolve)).toBe("plain text");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("resolves nested references (depth 2)", async () => {
    // A = "${B}", B = "world"
    const store: Record<string, string> = { A: "${B}", B: "world" };
    const resolve = async (key: string) => store[key] ?? "";
    expect(await interpolate("${A}", resolve)).toBe("world");
  });

  it("calls resolver only once per unique key even when referenced multiple times", async () => {
    const resolve = vi.fn(async (key: string) => (key === "X" ? "v" : ""));
    expect(await interpolate("${X}-${X}-${X}", resolve)).toBe("v-v-v");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("throws on circular references", async () => {
    // A → ${B}, B → ${A}
    const store: Record<string, string> = { A: "${B}", B: "${A}" };
    const resolve = async (key: string) => store[key] ?? "";
    await expect(interpolate("${A}", resolve)).rejects.toThrow(/[Cc]ircular/);
  });

  it("throws when reference chain exceeds max depth", async () => {
    // A→B→C→D→E: 5 unique keys, hits depth > MAX_DEPTH (3) before circular
    const store: Record<string, string> = {
      A: "${B}",
      B: "${C}",
      C: "${D}",
      D: "${E}",
      E: "leaf",
    };
    const resolve = async (key: string) => store[key] ?? "";
    await expect(interpolate("${A}", resolve)).rejects.toThrow(/depth exceeded/);
  });

  it("propagates errors thrown by the resolver", async () => {
    const resolve = async (_key: string): Promise<string> => {
      throw new Error("secret not found");
    };
    await expect(interpolate("${MISSING}", resolve)).rejects.toThrow("secret not found");
  });
});

// ---------------------------------------------------------------------------
// helpers.ts - toShellLine and parseTags
// ---------------------------------------------------------------------------

describe("toShellLine", () => {
  it("emits a plain assignment without export prefix", () => {
    expect(toShellLine("MY_KEY", "value", false)).toBe("MY_KEY='value'\n");
  });

  it("prepends export when exportPrefix is true", () => {
    expect(toShellLine("MY_KEY", "value", true)).toBe("export MY_KEY='value'\n");
  });

  it("normalizes dashes in key names to underscores", () => {
    expect(toShellLine("api-key", "val", false)).toBe("api_key='val'\n");
  });

  it("escapes single quotes in the value", () => {
    // "it's" → 'it'\''s'
    expect(toShellLine("key", "it's", false)).toBe("key='it'\\''s'\n");
  });

  it("normalizes all non-alphanumeric-underscore characters in key", () => {
    expect(toShellLine("my.key", "v", false)).toBe("my_key='v'\n");
  });
});

describe("parseTags", () => {
  it("splits a comma-separated string into trimmed tokens", () => {
    expect(parseTags("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around each tag", () => {
    expect(parseTags(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("filters out empty tokens from a string of only commas", () => {
    expect(parseTags(",,,")).toEqual([]);
  });

  it("handles a single tag without commas", () => {
    expect(parseTags("solo")).toEqual(["solo"]);
  });
});
