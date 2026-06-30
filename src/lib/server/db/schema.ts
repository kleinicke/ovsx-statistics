import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const extensions = sqliteTable('extensions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	namespace: text('namespace').notNull(),
	name: text('name').notNull(),
	displayName: text('display_name').notNull(),
	pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
	vsCodeId: text('vscode_id'), // e.g. "ms-python.python", null = not on VS Code Marketplace
	repoUrl: text('repo_url'),
	homepageUrl: text('homepage_url'),
	bugsUrl: text('bugs_url')
});

// One row per extension per day
export const snapshots = sqliteTable('snapshots', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	extensionId: integer('extension_id')
		.notNull()
		.references(() => extensions.id),
	date: text('date').notNull(), // YYYY-MM-DD — used for one-per-day dedup
	scrapedAt: text('scraped_at').notNull(), // ISO 8601 timestamp of actual scrape
	downloadCount: integer('download_count').notNull(),
	version: text('version').notNull()
});

// VS Code Marketplace install counts — one row per extension per day
export const vsCodeSnapshots = sqliteTable('vscode_snapshots', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	extensionId: integer('extension_id')
		.notNull()
		.references(() => extensions.id),
	date: text('date').notNull(), // YYYY-MM-DD
	scrapedAt: text('scraped_at').notNull(),
	installCount: integer('install_count').notNull()
});

// Tags fetched on-demand when visiting an extension page; indexed for future search
export const extensionTags = sqliteTable(
	'extension_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		extensionId: integer('extension_id').notNull().references(() => extensions.id),
		tag: text('tag').notNull()
	},
	(t) => [index('idx_tags_extension').on(t.extensionId), index('idx_tags_tag').on(t.tag)]
);

// Written only when version changes
export const versionEvents = sqliteTable('version_events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	extensionId: integer('extension_id')
		.notNull()
		.references(() => extensions.id),
	date: text('date').notNull(), // YYYY-MM-DD
	detectedAt: text('detected_at').notNull(), // ISO 8601 timestamp when the change was detected
	oldVersion: text('old_version').notNull(),
	newVersion: text('new_version').notNull()
});
