import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const extensions = sqliteTable(
	'extensions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		namespace: text('namespace').notNull(),
		name: text('name').notNull(),
		displayName: text('display_name').notNull(),
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
		vsCodeId: text('vscode_id'), // e.g. "ms-python.python", null = not on VS Code Marketplace
		vsCodeCheckedAt: text('vscode_checked_at'), // ISO 8601 — last VS Code Marketplace discovery attempt
		jetbrainsId: integer('jetbrains_id'), // numeric JetBrains Marketplace plugin ID, null = not published there
		iconUrl: text('icon_url'),
		description: text('description'),
		repoUrl: text('repo_url'),
		homepageUrl: text('homepage_url'),
		bugsUrl: text('bugs_url')
	},
	(t) => [uniqueIndex('idx_extensions_namespace_name').on(t.namespace, t.name)]
);

// One row per extension per day
export const snapshots = sqliteTable(
	'snapshots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id')
			.notNull()
			.references(() => extensions.id),
		date: text('date').notNull(), // YYYY-MM-DD — used for one-per-day dedup
		scrapedAt: text('scraped_at').notNull(), // ISO 8601 timestamp of actual scrape
		downloadCount: integer('download_count').notNull(),
		version: text('version').notNull()
	},
	(t) => [
		uniqueIndex('idx_snapshots_extension_date').on(t.extensionId, t.date),
		index('idx_snapshots_date_download_count').on(t.date, t.downloadCount)
	]
);

// VS Code Marketplace install counts — one row per extension per day
export const vsCodeSnapshots = sqliteTable(
	'vscode_snapshots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id')
			.notNull()
			.references(() => extensions.id),
		date: text('date').notNull(), // YYYY-MM-DD
		scrapedAt: text('scraped_at').notNull(),
		installCount: integer('install_count').notNull()
	},
	(t) => [
		uniqueIndex('idx_vscode_snapshots_extension_date').on(t.extensionId, t.date),
		index('idx_vscode_snapshots_date').on(t.date)
	]
);

// JetBrains Marketplace download counts — one row per plugin per day
export const jetbrainsSnapshots = sqliteTable(
	'jetbrains_snapshots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id')
			.notNull()
			.references(() => extensions.id),
		date: text('date').notNull(), // YYYY-MM-DD
		scrapedAt: text('scraped_at').notNull(),
		downloadCount: integer('download_count').notNull()
	},
	(t) => [
		uniqueIndex('idx_jetbrains_snapshots_extension_date').on(t.extensionId, t.date),
		index('idx_jetbrains_snapshots_date').on(t.date)
	]
);

// Extra per-day numbers for sources that report more than one (e.g. Zenodo
// unique/total downloads and views). The main series stays in the snapshot tables.
export const sourceMetrics = sqliteTable(
	'source_metrics',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id')
			.notNull()
			.references(() => extensions.id),
		date: text('date').notNull(), // YYYY-MM-DD
		metric: text('metric').notNull(), // key from METRIC_LABELS in utils.ts
		value: integer('value').notNull()
	},
	(t) => [
		uniqueIndex('idx_source_metrics_extension_date_metric').on(t.extensionId, t.date, t.metric),
		index('idx_source_metrics_extension').on(t.extensionId)
	]
);

// Tags fetched on-demand when visiting an extension page; indexed for future search
export const extensionTags = sqliteTable(
	'extension_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id').notNull().references(() => extensions.id),
		tag: text('tag').notNull()
	},
	(t) => [
		uniqueIndex('idx_tags_extension_tag').on(t.extensionId, t.tag),
		index('idx_tags_extension').on(t.extensionId),
		index('idx_tags_tag').on(t.tag)
	]
);

// Written only when version changes — at most one event per extension per day
export const versionEvents = sqliteTable(
	'version_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id')
			.notNull()
			.references(() => extensions.id),
		date: text('date').notNull(), // YYYY-MM-DD
		detectedAt: text('detected_at').notNull(), // ISO 8601 timestamp when the change was detected
		oldVersion: text('old_version').notNull(),
		newVersion: text('new_version').notNull()
	},
	(t) => [uniqueIndex('idx_version_events_extension_date').on(t.extensionId, t.date)]
);
