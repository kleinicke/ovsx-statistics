CREATE TABLE `extensions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`namespace` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`date` text NOT NULL,
	`scraped_at` text NOT NULL,
	`download_count` integer NOT NULL,
	`version` text NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `version_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`date` text NOT NULL,
	`detected_at` text NOT NULL,
	`old_version` text NOT NULL,
	`new_version` text NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
