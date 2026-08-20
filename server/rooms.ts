import { env } from "cloudflare:workers";
import { HttpError } from "./http";

type Result<T = unknown> = { meta?: { changes?: number }; results?: T[] };
type Statement = {
  bind(...values: unknown[]): Statement;
  run<T = unknown>(): Promise<Result<T>>;
  first<T = unknown>(): Promise<T | null>;
};
type Database = { prepare(sql: string): Statement };

type RoomRow = {
  id: string;
  code_digest: string;
  sender_token_digest: string;
  receiver_token_digest: string | null;
  sender_seen_at: number;
  receiver_seen_at: number | null;
  sender_public_key: string | null;
  receiver_public_key: string | null;
  expires_at: number;
  status: "waiting" | "connected" | "closed";
};

function database(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Room database is unavailable");
  return db;
}

let schemaReady: Promise<void> | undefined;
function ensureSchema(db: Database): Promise<void> {
  schemaReady ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      id text PRIMARY KEY NOT NULL,
      code_digest text NOT NULL UNIQUE,
      sender_token_digest text NOT NULL,
      receiver_token_digest text,
      sender_seen_at integer NOT NULL,
      receiver_seen_at integer,
      sender_public_key text,
      receiver_public_key text,
      expires_at integer NOT NULL,
      status text NOT NULL,
      created_at integer NOT NULL
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS rooms_expiry_idx ON rooms (expires_at)").run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS room_signals (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      room_id text NOT NULL,
      sender_role text NOT NULL,
      kind text NOT NULL,
      payload text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS room_signals_room_idx ON room_signals (room_id, id)").run();
  })();
  return schemaReady;
}

function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % 100_000_000);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return (values[0] % 100_000_000).toString().padStart(8, "0");
}

export async function createRoom() {
  const db = database();
  await ensureSchema(db);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomToken(18);
    const code = randomCode();
    const senderToken = randomToken(32);
    try {
      await db.prepare(`INSERT INTO rooms
        (id, code_digest, sender_token_digest, sender_seen_at, expires_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'waiting', ?)`)
        .bind(id, await digest(code), await digest(senderToken), now, expiresAt, now).run();
      return { id, code, senderToken, expiresAt };
    } catch (error) {
      if (attempt === 7) throw error;
    }
  }
  throw new Error("Unable to allocate a room code");
}

export async function joinRoom(rawCode: unknown) {
  const code = String(rawCode ?? "").replace(/\D/gu, "");
  if (!/^\d{8}$/u.test(code)) throw new HttpError("Room code must contain 8 digits", 400);
  const db = database();
  await ensureSchema(db);
  const now = Date.now();
  const room = await db.prepare("SELECT * FROM rooms WHERE code_digest = ? AND expires_at > ?")
    .bind(await digest(code), now).first<RoomRow>();
  if (!room || room.status !== "waiting") throw new HttpError("Unable to join room", 404);
  const receiverToken = randomToken(32);
  const update = await db.prepare(`UPDATE rooms SET receiver_token_digest = ?, receiver_seen_at = ?, status = 'connected'
    WHERE id = ? AND status = 'waiting' AND receiver_token_digest IS NULL AND expires_at > ?`)
    .bind(await digest(receiverToken), now, room.id, now).run();
  if (update.meta?.changes !== 1) throw new HttpError("Unable to join room", 409);
  return { id: room.id, receiverToken, expiresAt: room.expires_at };
}

async function authorizedRoom(id: string, token: string) {
  const db = database();
  await ensureSchema(db);
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ? AND expires_at > ?")
    .bind(id, Date.now()).first<RoomRow>();
  if (!room) throw new HttpError("Room is unavailable", 404);
  const tokenDigest = await digest(token);
  const role = tokenDigest === room.sender_token_digest ? "sender"
    : tokenDigest === room.receiver_token_digest ? "receiver" : null;
  if (!role) throw new HttpError("Room access denied", 403);
  return { db, room, role } as const;
}

export async function heartbeatRoom(id: string, token: string) {
  const { db, room, role } = await authorizedRoom(id, token);
  const now = Date.now();
  const column = role === "sender" ? "sender_seen_at" : "receiver_seen_at";
  await db.prepare(`UPDATE rooms SET ${column} = ? WHERE id = ?`).bind(now, id).run();
  const peerSeenAt = role === "sender" ? room.receiver_seen_at : room.sender_seen_at;
  const peerPublicKey = role === "sender" ? room.receiver_public_key : room.sender_public_key;
  return {
    id,
    role,
    status: room.status,
    peerOnline: room.status === "connected" && peerSeenAt !== null && peerSeenAt >= now - 15_000,
    peerPublicKey,
    expiresAt: room.expires_at,
  };
}

function validatePublicKey(value: unknown): string {
  const key = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{80,160}$/u.test(key)) throw new HttpError("Invalid public key", 400);
  return key;
}

export async function registerPublicKey(id: string, token: string, rawPublicKey: unknown) {
  const publicKey = validatePublicKey(rawPublicKey);
  const { db, room, role } = await authorizedRoom(id, token);
  const column = role === "sender" ? "sender_public_key" : "receiver_public_key";
  const existing = role === "sender" ? room.sender_public_key : room.receiver_public_key;
  if (existing && existing !== publicKey) throw new HttpError("Public key is already locked", 409);
  await db.prepare(`UPDATE rooms SET ${column} = ? WHERE id = ? AND (${column} IS NULL OR ${column} = ?)`)
    .bind(publicKey, id, publicKey).run();
  return {
    role,
    publicKey,
    peerPublicKey: role === "sender" ? room.receiver_public_key : room.sender_public_key,
  };
}

type SignalKind = "offer" | "answer" | "ice" | "bye";
const signalKinds = new Set<SignalKind>(["offer", "answer", "ice", "bye"]);

export async function publishSignal(id: string, token: string, rawKind: unknown, rawPayload: unknown) {
  const { db, role } = await authorizedRoom(id, token);
  const kind = String(rawKind ?? "") as SignalKind;
  if (!signalKinds.has(kind)) throw new HttpError("Invalid signal kind", 400);
  const payload = JSON.stringify(rawPayload ?? null);
  if (payload.length > 24_000) throw new HttpError("Signal payload is too large", 400);
  const now = Date.now();
  const result = await db.prepare(`INSERT INTO room_signals (room_id, sender_role, kind, payload, created_at)
    VALUES (?, ?, ?, ?, ?) RETURNING id`).bind(id, role, kind, payload, now).first<{ id: number }>();
  if (!result) throw new Error("Unable to publish signal");
  return { id: result.id, createdAt: now };
}

export async function readSignals(id: string, token: string, rawAfter: unknown) {
  const { db, role } = await authorizedRoom(id, token);
  const after = Number(rawAfter ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new HttpError("Invalid signal cursor", 400);
  const rows = await db.prepare(`SELECT id, kind, payload, created_at FROM room_signals
    WHERE room_id = ? AND sender_role <> ? AND id > ? ORDER BY id ASC LIMIT 100`)
    .bind(id, role, after).run<{ id: number; kind: SignalKind; payload: string; created_at: number }>();
  const signals = (rows.results ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
  }));
  return { signals, cursor: signals.at(-1)?.id ?? after };
}
