import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const transfers = sqliteTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull().unique(),
    encryptedSize: integer("encrypted_size").notNull(),
    formatVersion: integer("format_version").notNull().default(1),
    fileId: text("file_id"),
    partCount: integer("part_count").notNull().default(1),
    status: text("status", { enum: ["pending", "ready"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
    downloadLimit: integer("download_limit").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    deleteTokenDigest: text("delete_token_digest").notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("transfers_expiry_idx").on(table.expiresAt),
    index("transfers_status_idx").on(table.status),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("rate_key").primaryKey(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [index("rate_limits_window_idx").on(table.windowStart)],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    codeDigest: text("code_digest").notNull().unique(),
    senderTokenDigest: text("sender_token_digest").notNull(),
    receiverTokenDigest: text("receiver_token_digest"),
    senderSeenAt: integer("sender_seen_at").notNull(),
    receiverSeenAt: integer("receiver_seen_at"),
    senderPublicKey: text("sender_public_key"),
    receiverPublicKey: text("receiver_public_key"),
    expiresAt: integer("expires_at").notNull(),
    status: text("status", { enum: ["waiting", "connected", "closed"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("rooms_expiry_idx").on(table.expiresAt)],
);

export const roomSignals = sqliteTable(
  "room_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    senderRole: text("sender_role", { enum: ["sender", "receiver"] }).notNull(),
    kind: text("kind", { enum: ["offer", "answer", "ice", "bye"] }).notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("room_signals_room_idx").on(table.roomId, table.id)],
);
