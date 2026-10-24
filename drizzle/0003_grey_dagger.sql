CREATE TABLE `jetbrains_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`date` text NOT NULL,
	`scraped_at` text NOT NULL,
	`download_count` integer NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jetbrains_snapshots_extension_date` ON `jetbrains_snapshots` (`extension_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_jetbrains_snapshots_date` ON `jetbrains_snapshots` (`date`);--> statement-breakpoint
ALTER TABLE `extensions` ADD `jetbrains_id` integer;