CREATE UNIQUE INDEX `idx_tags_extension_tag` ON `extension_tags` (`extension_id`,`tag`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_date_download_count` ON `snapshots` (`date`,`download_count`);--> statement-breakpoint
CREATE INDEX `idx_vscode_snapshots_date` ON `vscode_snapshots` (`date`);