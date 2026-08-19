import { env } from "cloudflare:workers";
import { HttpError } from "./http";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type Database = { prepare(sql: string): Statement };

function database(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Rate-limit database is unavailable");
  return db;
}

let schemaReady: Promise<void> | undefined;

function ensureSchema(db: Database): Promise<void> {
  schemaReady ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key text PRIMARY KEY NOT NULL,
      window_start integer NOT NULL,
      count integer NOT NULL
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start)").run();
  })();
  return schemaReady;
}

async function rateKey(scope: string, identity: string, windowStart: number) {
  const value = new TextEncoder().encode(`${scope}:${windowStart}:${identity}`);
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  maximum: number,
  windowMs = 60 * 60 * 1000,
) {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = await rateKey(scope, forwarded, windowStart);
  const db = database();
  await ensureSchema(db);
  const row = await db.prepare(
    `INSERT INTO rate_limits (rate_key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(rate_key) DO UPDATE SET count = count + 1
     RETURNING count`,
  ).bind(key, windowStart).first<{ count: number }>();
  if (!row || row.count > maximum) throw new HttpError("Too many requests", 429);
}

export async function cleanupRateLimits(before: number) {
  const db = database();
  await ensureSchema(db);
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(before).run();
}
