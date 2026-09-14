import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    shareTokenDigest: text("share_token_digest").notNull(),
    editTokenDigest: text("edit_token_digest").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    shareTokenDigestIdx: uniqueIndex("bills_share_token_digest_idx").on(
      table.shareTokenDigest,
    ),
    editTokenDigestIdx: uniqueIndex("bills_edit_token_digest_idx").on(
      table.editTokenDigest,
    ),
  }),
);
