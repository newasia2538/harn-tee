CREATE TABLE `bill_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`share_token_digest` text NOT NULL,
	`edit_token_digest` text NOT NULL,
	`deleted_at` integer NOT NULL,
	`reason` text NOT NULL,
	`state` text NOT NULL,
	`scan_cursor` text,
	`scan_complete` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_deletions_share_idx` ON `bill_deletions` (`share_token_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_deletions_edit_idx` ON `bill_deletions` (`edit_token_digest`);--> statement-breakpoint
CREATE INDEX `bill_deletions_pending_idx` ON `bill_deletions` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `bill_qr_assets` (
	`object_key` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`selection_id` text,
	`put_settled` integer DEFAULT 0 NOT NULL,
	`attached` integer DEFAULT 0 NOT NULL,
	`cleanup_requested` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bill_qr_assets_bill_idx` ON `bill_qr_assets` (`bill_id`);--> statement-breakpoint
CREATE INDEX `bill_qr_assets_cleanup_idx` ON `bill_qr_assets` (`cleanup_requested`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `bill_retention_policy` (
	`id` text PRIMARY KEY NOT NULL,
	`rollout_at` integer NOT NULL,
	`maintenance_next_run_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bills` ADD `last_activity_at` integer;--> statement-breakpoint
ALTER TABLE `bills` ADD `all_paid_at` integer;--> statement-breakpoint
ALTER TABLE `bills` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `bills` ADD `retention_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `bills_expires_at_idx` ON `bills` (`expires_at`);
--> statement-breakpoint
-- Bounded policy bootstrap only. Bill backfill stays outside migrations.
INSERT INTO `bill_retention_policy` (`id`, `rollout_at`, `maintenance_next_run_at`)
VALUES ('lifecycle-v1', CAST(strftime('%s','now') AS INTEGER) * 1000, 0);
