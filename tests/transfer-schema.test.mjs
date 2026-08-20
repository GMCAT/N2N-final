import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function database() {
  const db = new DatabaseSync(":memory:");
  for (const name of ["0000_create_transfers.sql", "0001_add_chunked_transfers.sql", "0002_add_rate_limits.sql", "0003_flaky_marten_broadcloak.sql"]) {
    const migration = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
  }
  return db;
}

test("creates the transfer schema and enforces unique object keys", async () => {
  const db = await database();
  const insert = db.prepare(`INSERT INTO transfers
    (id, object_key, encrypted_size, status, expires_at, download_limit,
     download_count, delete_token_digest, created_at)
    VALUES (?, ?, ?, 'ready', ?, ?, 0, ?, ?)`);
  insert.run("first", "transfers/shared.n2n", 10, Date.now() + 10_000, 1, "digest", Date.now());
  assert.throws(
    () => insert.run("second", "transfers/shared.n2n", 10, Date.now() + 10_000, 1, "digest", Date.now()),
    /UNIQUE constraint failed/u,
  );
});

test("rate limits increment atomically without storing raw identities", async () => {
  const db = await database();
  const increment = db.prepare(`INSERT INTO rate_limits (rate_key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(rate_key) DO UPDATE SET count = count + 1 RETURNING count`);
  assert.equal(increment.get("hashed-identity", 1000).count, 1);
  assert.equal(increment.get("hashed-identity", 1000).count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM rate_limits").get().count, 1);
});

test("stores chunk manifest fields without plaintext metadata", async () => {
  const db = await database();
  const columns = db.prepare("PRAGMA table_info(transfers)").all().map((column) => column.name);
  assert.ok(columns.includes("format_version"));
  assert.ok(columns.includes("file_id"));
  assert.ok(columns.includes("part_count"));
  assert.ok(!columns.includes("filename"));
  assert.ok(!columns.includes("content_type"));
});

test("atomically refuses downloads beyond the configured limit", async () => {
  const db = await database();
  const now = Date.now();
  db.prepare(`INSERT INTO transfers
    (id, object_key, encrypted_size, status, expires_at, download_limit,
     download_count, delete_token_digest, created_at)
    VALUES (?, ?, 10, 'ready', ?, 1, 0, 'digest', ?)`)
    .run("limited", "transfers/limited.n2n", now + 10_000, now);

  const consume = db.prepare(`UPDATE transfers SET download_count = download_count + 1
    WHERE id = ? AND status = 'ready' AND expires_at > ?
      AND download_count < download_limit`);
  assert.equal(consume.run("limited", now).changes, 1);
  assert.equal(consume.run("limited", now).changes, 0);
  assert.equal(db.prepare("SELECT download_count FROM transfers WHERE id = ?").get("limited").download_count, 1);
});

test("locks pairing rooms to one receiver and keeps signaling opaque", async () => {
  const db = await database();
  const now = Date.now();
  db.prepare(`INSERT INTO rooms
    (id, code_digest, sender_token_digest, sender_seen_at, expires_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'waiting', ?)`)
    .run("room-1", "code-digest", "sender-digest", now, now + 600_000, now);

  const claim = db.prepare(`UPDATE rooms SET receiver_token_digest = ?, receiver_seen_at = ?, status = 'connected'
    WHERE id = ? AND status = 'waiting' AND receiver_token_digest IS NULL AND expires_at > ?`);
  assert.equal(claim.run("receiver-a", now, "room-1", now).changes, 1);
  assert.equal(claim.run("receiver-b", now, "room-1", now).changes, 0);

  db.prepare(`INSERT INTO room_signals (room_id, sender_role, kind, payload, created_at)
    VALUES (?, 'sender', 'offer', ?, ?)`).run("room-1", JSON.stringify({ sdp: "opaque" }), now);
  const signal = db.prepare("SELECT sender_role, kind, payload FROM room_signals WHERE room_id = ?").get("room-1");
  assert.equal(signal.sender_role, "sender");
  assert.equal(signal.kind, "offer");
  assert.deepEqual(JSON.parse(signal.payload), { sdp: "opaque" });
});
