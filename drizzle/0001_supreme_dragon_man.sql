CREATE TABLE `extension_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tags_extension` ON `extension_tags` (`extension_id`);--> statement-breakpoint
CREATE INDEX `idx_tags_tag` ON `extension_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `vscode_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`date` text NOT NULL,
	`scraped_at` text NOT NULL,
	`install_count` integer NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vscode_snapshots_extension_date` ON `vscode_snapshots` (`extension_id`,`date`);--> statement-breakpoint
ALTER TABLE `extensions` ADD `vscode_id` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `vscode_checked_at` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `icon_url` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `description` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `repo_url` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `homepage_url` text;--> statement-breakpoint
ALTER TABLE `extensions` ADD `bugs_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_extensions_namespace_name` ON `extensions` (`namespace`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_snapshots_extension_date` ON `snapshots` (`extension_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_version_events_extension_date` ON `version_events` (`extension_id`,`date`);