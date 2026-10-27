CREATE TABLE `source_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` integer NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`extension_id`) REFERENCES `extensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_metrics_extension_date_metric` ON `source_metrics` (`extension_id`,`date`,`metric`);--> statement-breakpoint
CREATE INDEX `idx_source_metrics_extension` ON `source_metrics` (`extension_id`);