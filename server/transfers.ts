import { env } from "cloudflare:workers";
import { validateTransferPolicy } from "@/lib/transfer-policy";
import { validateChunkManifest } from "@/lib/transfer-policy";
export { MAX_ENCRYPTED_BYTES, validateChunkManifest, validateTransferPolicy } from "@/lib/transfer-policy";
export const MAX_PART_BYTES = 4 * 1024 * 1024 + 28;

type D1Result<T = unknown> = {
  success: boolean;
  meta?: { changes?: number };
  results?: T[];
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
};

type D1DatabaseLike = {
  prepare(sql: string): D1Statement;
};

type R2ObjectLike = {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
};

type R2BucketLike = {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: object): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
};

type RuntimeEnv = {
  DB?: D1DatabaseLike;
  FILES?: R2BucketLike;
};

export type TransferRecord = {
  id: string;
  object_key: string;
  encrypted_size: number;
  format_version: number;
  file_id: string | null;
  part_count: number;
  status: "pending" | "ready";
  expires_at: number;
  download_limit: number;
  download_count: number;
  delete_token_digest: string;
};

function bindings(): { db: D1DatabaseLike; files: R2BucketLike } {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB || !runtime.FILES) {
    throw new Error("N2N storage bindings are unavailable");
  }
  return { db: runtime.DB, files: runtime.FILES };
}

let transferSchemaReady: Promise<void> | undefined;

function ensureTransferSchema(db: D1DatabaseLike): Promise<void> {
  transferSchemaReady ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS transfers (
      id text PRIMARY KEY NOT NULL,
      object_key text NOT NULL UNIQUE,
      encrypted_size integer NOT NULL,
      format_version integer DEFAULT 1 NOT NULL,
      file_id text,
      part_count integer DEFAULT 1 NOT NULL,
      status text NOT NULL,
      expires_at integer NOT NULL,
      download_limit integer NOT NULL,
      download_count integer DEFAULT 0 NOT NULL,
      delete_token_digest text NOT NULL,
      created_at integer NOT NULL,
      completed_at integer
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS transfers_expiry_idx ON transfers (expires_at)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS transfers_status_idx ON transfers (status)").run();
  })();
  return transferSchemaReady;
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function digestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTransfer(
  policy: ReturnType<typeof validateTransferPolicy> & ReturnType<typeof validateChunkManifest>,
) {
  const { db } = bindings();
  await ensureTransferSchema(db);
  const id = randomToken(18);
  const deleteToken = randomToken(32);
  const objectKey = `transfers/${id}.n2n`;
  const createdAt = Date.now();
  const expiresAt = createdAt + policy.expiresInSeconds * 1000;
  const deleteTokenDigest = await digestToken(deleteToken);

  await db.prepare(
    `INSERT INTO transfers
      (id, object_key, encrypted_size, format_version, file_id, part_count,
       status, expires_at, download_limit, download_count, delete_token_digest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?)`,
  ).bind(id, objectKey, policy.encryptedSize, policy.formatVersion, policy.fileId,
    policy.partCount, expiresAt, policy.downloadLimit, deleteTokenDigest, createdAt).run();

  return { id, deleteToken, expiresAt };
}

export async function getTransfer(id: string): Promise<TransferRecord | null> {
  const { db } = bindings();
  await ensureTransferSchema(db);
  return db.prepare(
    `SELECT id, object_key, encrypted_size, format_version, file_id, part_count,
            status, expires_at, download_limit,
            download_count, delete_token_digest
       FROM transfers WHERE id = ?`,
  ).bind(id).first<TransferRecord>();
}

export async function storeCiphertext(record: TransferRecord, body: ArrayBuffer) {
  if (record.status !== "pending") throw new Error("Transfer is not pending");
  if (record.expires_at <= Date.now()) throw new Error("Transfer has expired");
  if (body.byteLength !== record.encrypted_size) throw new Error("Encrypted size does not match");
  const { files } = bindings();
  await files.put(record.object_key, body, {
    httpMetadata: { contentType: "application/vnd.n2n.encrypted+json" },
    customMetadata: { transferId: record.id },
  });
}

function partKey(record: TransferRecord, index: number) {
  return `${record.object_key}/parts/${index.toString().padStart(4, "0")}`;
}

export async function storeCiphertextPart(record: TransferRecord, index: number, body: ArrayBuffer) {
  if (record.format_version !== 2 || record.status !== "pending") throw new Error("Transfer is not pending");
  if (record.expires_at <= Date.now()) throw new Error("Transfer has expired");
  if (!Number.isSafeInteger(index) || index < 0 || index >= record.part_count) throw new Error("Part index is out of range");
  if (body.byteLength < 29 || body.byteLength > MAX_PART_BYTES) throw new Error("Encrypted part size is invalid");
  const { files } = bindings();
  await files.put(partKey(record, index), body, { httpMetadata: { contentType: "application/octet-stream" } });
}

export async function completeTransfer(record: TransferRecord) {
  const { db, files } = bindings();
  if (record.format_version === 2) {
    let storedSize = 0;
    for (let index = 0; index < record.part_count; index += 1) {
      const part = await files.head(partKey(record, index));
      if (!part) throw new Error("Encrypted object is incomplete");
      storedSize += part.size;
    }
    if (storedSize !== record.encrypted_size) throw new Error("Encrypted object is incomplete");
  } else {
    const object = await files.head(record.object_key);
    if (!object || object.size !== record.encrypted_size) throw new Error("Encrypted object is incomplete");
  }
  const result = await db.prepare(
    "UPDATE transfers SET status = 'ready', completed_at = ? WHERE id = ? AND status = 'pending' AND expires_at > ?",
  ).bind(Date.now(), record.id, Date.now()).run();
  if (result.meta?.changes !== 1) throw new Error("Transfer cannot be completed");
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

async function chunkedBody(record: TransferRecord, files: R2BucketLike) {
  const fileIdBytes = new TextEncoder().encode(record.file_id ?? "");
  const size = record.encrypted_size + 12 + fileIdBytes.byteLength + record.part_count * 4;
  const body = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(new TextEncoder().encode("N2N2"));
        controller.enqueue(uint32(fileIdBytes.byteLength));
        controller.enqueue(fileIdBytes);
        controller.enqueue(uint32(record.part_count));
        for (let index = 0; index < record.part_count; index += 1) {
          const part = await files.get(partKey(record, index));
          if (!part) throw new Error("Encrypted part is unavailable");
          controller.enqueue(uint32(part.size));
          const reader = part.body.getReader();
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            controller.enqueue(chunk.value);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return { body, size };
}

export async function consumeDownload(id: string): Promise<{ record: TransferRecord; body: ReadableStream; size: number }> {
  const { db, files } = bindings();
  const now = Date.now();
  const update = await db.prepare(
    `UPDATE transfers SET download_count = download_count + 1
      WHERE id = ? AND status = 'ready' AND expires_at > ?
        AND download_count < download_limit`,
  ).bind(id, now).run();
  if (update.meta?.changes !== 1) throw new Error("Transfer is unavailable or its download limit was reached");

  const record = await getTransfer(id);
  if (!record) throw new Error("Transfer is unavailable");
  if (record.format_version === 2) {
    const chunked = await chunkedBody(record, files);
    return { record, ...chunked };
  }
  const object = await files.get(record.object_key);
  if (!object) throw new Error("Encrypted object is unavailable");
  return { record, body: object.body, size: object.size };
}

export async function deleteTransfer(record: TransferRecord, deleteToken: string) {
  if (!deleteToken || await digestToken(deleteToken) !== record.delete_token_digest) {
    throw new Error("Invalid deletion token");
  }
  const { db, files } = bindings();
  if (record.format_version === 2) {
    for (let index = 0; index < record.part_count; index += 1) await files.delete(partKey(record, index));
  } else {
    await files.delete(record.object_key);
  }
  await db.prepare("DELETE FROM transfers WHERE id = ?").bind(record.id).run();
}

export async function cleanupExpiredTransfers(now = Date.now()): Promise<number> {
  const { db, files } = bindings();
  await ensureTransferSchema(db);
  const expired = await db.prepare(
    "SELECT id, object_key, format_version, part_count FROM transfers WHERE expires_at <= ? LIMIT 100",
  ).bind(now).run<{ id: string; object_key: string; format_version: number; part_count: number }>();
  let removed = 0;
  for (const transfer of expired.results ?? []) {
    if (transfer.format_version === 2) {
      for (let index = 0; index < transfer.part_count; index += 1) {
        await files.delete(`${transfer.object_key}/parts/${index.toString().padStart(4, "0")}`);
      }
    } else {
      await files.delete(transfer.object_key);
    }
    const result = await db.prepare("DELETE FROM transfers WHERE id = ? AND expires_at <= ?")
      .bind(transfer.id, now).run();
    if (result.meta?.changes === 1) removed += 1;
  }
  return removed;
}

export function publicTransfer(record: TransferRecord) {
  return {
    id: record.id,
    encryptedSize: record.encrypted_size,
    expiresAt: record.expires_at,
    downloadsRemaining: Math.max(0, record.download_limit - record.download_count),
    formatVersion: record.format_version,
    partCount: record.part_count,
  };
}
