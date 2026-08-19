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
