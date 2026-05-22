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

import { getCloudflareContext } from "@opennextjs/cloudflare";
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

let fileStore: KVStore | null = null;

export function getKV(): KVStore {
  // Prefer the Cloudflare binding when running on the Workers runtime
  // (production or `bun preview`). getCloudflareContext() throws under a
  // plain `next dev`, in which case we fall back to the file store.
  try {
    const { env } = getCloudflareContext();
    const ns = (env as { PROJECTBLUE_KV?: CloudflareKVNamespace }).PROJECTBLUE_KV;
    if (ns) return new CloudflareKV(ns);
  } catch {
    /* not on the Cloudflare runtime — fall through */
  }

  if (!fileStore) {
    fileStore = new FileKV(join(process.cwd(), ".kv-dev", "projectblue.json"));
  }
  return fileStore;
}
