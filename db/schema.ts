import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    shareTokenDigest: text("share_token_digest").notNull(),
    editTokenDigest: text("edit_token_digest").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastActivityAt: integer("last_activity_at"),
    allPaidAt: integer("all_paid_at"),
    expiresAt: integer("expires_at"),
    retentionVersion: integer("retention_version").notNull().default(0),
  },
  (table) => ({
    expiresAtIdx: index("bills_expires_at_idx").on(table.expiresAt),
    shareTokenDigestIdx: uniqueIndex("bills_share_token_digest_idx").on(
      table.shareTokenDigest,
    ),
    editTokenDigestIdx: uniqueIndex("bills_edit_token_digest_idx").on(
      table.editTokenDigest,
    ),
  }),
);

export const billDeletions=sqliteTable("bill_deletions",{
  id:text("id").primaryKey(),
  shareTokenDigest:text("share_token_digest").notNull(),
  editTokenDigest:text("edit_token_digest").notNull(),
  deletedAt:integer("deleted_at").notNull(),
  reason:text("reason",{enum:["manual","expired"]}).notNull(),
  state:text("state",{enum:["deleting","deleted"]}).notNull(),
  scanCursor:text("scan_cursor"),
  scanComplete:integer("scan_complete").notNull().default(0),
  nextAttemptAt:integer("next_attempt_at").notNull().default(0),
  attempts:integer("attempts").notNull().default(0),
},table=>({
  shareIdx:uniqueIndex("bill_deletions_share_idx").on(table.shareTokenDigest),
  editIdx:uniqueIndex("bill_deletions_edit_idx").on(table.editTokenDigest),
  pendingIdx:index("bill_deletions_pending_idx").on(table.state,table.nextAttemptAt),
}));
export const billQrAssets=sqliteTable("bill_qr_assets",{
  objectKey:text("object_key").primaryKey(),billId:text("bill_id").notNull(),selectionId:text("selection_id"),
  putSettled:integer("put_settled").notNull().default(0),attached:integer("attached").notNull().default(0),
  cleanupRequested:integer("cleanup_requested").notNull().default(0),
  nextAttemptAt:integer("next_attempt_at").notNull().default(0),attempts:integer("attempts").notNull().default(0),
},table=>({billIdx:index("bill_qr_assets_bill_idx").on(table.billId),cleanupIdx:index("bill_qr_assets_cleanup_idx").on(table.cleanupRequested,table.nextAttemptAt)}));
export const billRetentionPolicy=sqliteTable("bill_retention_policy",{
  id:text("id").primaryKey(),rolloutAt:integer("rollout_at").notNull(),maintenanceNextRunAt:integer("maintenance_next_run_at").notNull().default(0),
});
