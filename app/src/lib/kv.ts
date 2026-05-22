/**
 * Tiny key-value abstraction.
 *
 * Production (Cloudflare Workers via OpenNext): a KV namespace bound as
 * PROJECTBLUE_KV in wrangler.jsonc, fetched via getCloudflareContext.
 *
 * Development (Node `next dev`): a file at `.kv-dev/projectblue.json`
 * (gitignored) backs the same interface, so admin + CMS work locally
 * without a real KV namespace.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

interface CloudflareKVNamespace {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

class CloudflareKV implements KVStore {
  constructor(private readonly ns: CloudflareKVNamespace) {}
  async get<T>(key: string): Promise<T | null> {
    const value = await this.ns.get(key, "json");
    return (value ?? null) as T | null;
  }
  async put<T>(key: string, value: T): Promise<void> {
    await this.ns.put(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    await this.ns.delete(key);
  }
  async list(prefix?: string): Promise<string[]> {
    const res = await this.ns.list(prefix ? { prefix } : undefined);
    return res.keys.map((k) => k.name);
  }
}

class FileKV implements KVStore {
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
  }
  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }
  private async writeAll(data: Record<string, unknown>): Promise<void> {
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(data, null, 2), "utf8");
  }
  async get<T>(key: string): Promise<T | null> {
    const all = await this.readAll();
    return (all[key] ?? null) as T | null;
  }
  async put<T>(key: string, value: T): Promise<void> {
    const all = await this.readAll();
    all[key] = value;
    await this.writeAll(all);
  }
  async delete(key: string): Promise<void> {
    const all = await this.readAll();
    delete all[key];
    await this.writeAll(all);
  }
  async list(prefix?: string): Promise<string[]> {
    const all = await this.readAll();
    const keys = Object.keys(all);
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }
}

let cached: KVStore | null = null;

export function getKV(): KVStore {
  if (cached) return cached;

  // Prefer the Cloudflare binding when running on the Workers runtime
  // (production or local `wrangler dev`). Falls back to the file store
  // when running `next dev` on Node.
  try {
    // Lazy require so Node-only `next dev` doesn't try to bundle worker code.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: () => {
        env?: { PROJECTBLUE_KV?: CloudflareKVNamespace };
      };
    };
    const ns = mod.getCloudflareContext?.().env?.PROJECTBLUE_KV;
    if (ns) {
      cached = new CloudflareKV(ns);
      return cached;
    }
  } catch {
    /* not on Cloudflare runtime — fall through to file store */
  }

  cached = new FileKV(join(process.cwd(), ".kv-dev", "projectblue.json"));
  return cached;
}
