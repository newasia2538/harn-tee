CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`share_token_digest` text NOT NULL,
	`edit_token_digest` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_share_token_digest_idx` ON `bills` (`share_token_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `bills_edit_token_digest_idx` ON `bills` (`edit_token_digest`);