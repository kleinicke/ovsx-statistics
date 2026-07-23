import { db } from './db/index.js';
import { extensions, snapshots, versionEvents } from './db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { chunk, fetchJson, HttpError } from './http.js';

const OPENVSX_API = 'https://open-vsx.org/api';
const PAGE_SIZE = 100;
const ROW_CHUNK = 400; // rows per multi-row insert — stays well under SQLite's variable limit
const BATCH_CHUNK = 100; // statements per db.batch round trip

// Extensions that are always tracked regardless of rank
const PINNED = [
	{ namespace: 'kleinicke', name: 'ply-visualizer' },
	{ namespace: 'kleinicke', name: 'tiff-visualizer' },
	{ namespace: 'janosh', name: 'matterviz' }
];

interface ScrapedExtension {
	namespace: string;
	name: string;
	displayName: string;
	version: string;
	downloadCount: number;
	iconUrl: string | null;
	description: string | null;
}

interface SearchEntry {
	namespace: string;
	name: string;
	displayName?: string;
	version: string;
	downloadCount?: number;
	description?: string;
	files?: { icon?: string };
}

const key = (e: { namespace: string; name: string }) => `${e.namespace}/${e.name}`;

function normalize(ext: SearchEntry): ScrapedExtension {
	return {
		namespace: ext.namespace,
		name: ext.name,
		displayName: ext.displayName ?? ext.name,
		version: ext.version,
		downloadCount: ext.downloadCount ?? 0,
		iconUrl: ext.files?.icon ?? null,
		description: ext.description ?? null
	};
}

// Paginate until the API returns an empty page (hard limit ~10k).
// Deduped by namespace/name since entries can shift between pages while paginating.
async function fetchAllExtensions(): Promise<ScrapedExtension[]> {
	const byKey = new Map<string, ScrapedExtension>();
	let offset = 0;

	while (true) {
		const url = `${OPENVSX_API}/-/search?size=${PAGE_SIZE}&offset=${offset}&sortBy=downloadCount&sortOrder=desc`;
		const data = await fetchJson<{ extensions?: SearchEntry[] }>(url);
		const batch = data.extensions ?? [];

		for (const ext of batch) {
			if (!byKey.has(key(ext))) byKey.set(key(ext), normalize(ext));
		}

		if (batch.length < PAGE_SIZE) break; // last page or API limit reached
		offset += PAGE_SIZE;
	}

	return [...byKey.values()];
}

async function fetchExtension(namespace: string, name: string): Promise<ScrapedExtension | null> {
	try {
		const data = await fetchJson<SearchEntry>(`${OPENVSX_API}/${namespace}/${name}`);
		return normalize(data);
	} catch (e) {
		if (e instanceof HttpError && e.status === 404) return null;
		throw e;
	}
}

// db.batch requires a non-empty tuple; centralize the chunking and cast here.
type Statement = Parameters<typeof db.batch>[0][number];
async function runBatched(statements: Statement[]): Promise<void> {
	for (const c of chunk(statements, BATCH_CHUNK)) {
		await db.batch(c as unknown as [Statement, ...Statement[]]);
	}
}

export async function runScrape(): Promise<{ scraped: number; errors: string[] }> {
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];

	console.log(`[scraper] Starting scrape for ${date}`);

	// Fetch everything up front — DB writes only start after a fully successful fetch,
	// so a mid-pagination failure never leaves a half-written day behind.
	const scraped = await fetchAllExtensions();
	console.log(`[scraper] Fetched ${scraped.length} extensions from API`);

	// Fetch pinned extensions that didn't make the search results
	const pinnedKeys = new Set(PINNED.map(key));
	const scrapedKeys = new Set(scraped.map(key));
	for (const pinned of PINNED) {
		if (scrapedKeys.has(key(pinned))) continue;
		try {
			const ext = await fetchExtension(pinned.namespace, pinned.name);
			if (ext) scraped.push(ext);
			else errors.push(`${key(pinned)}: not found`);
		} catch (e) {
			errors.push(`${key(pinned)}: ${e}`);
		}
	}

	// Insert extensions that are new since the last run
	const existing = await db
		.select({
			id: extensions.id,
			namespace: extensions.namespace,
			name: extensions.name,
			displayName: extensions.displayName,
			pinned: extensions.pinned,
			iconUrl: extensions.iconUrl,
			description: extensions.description
		})
		.from(extensions)
		.all();
	const existingByKey = new Map(existing.map((e) => [key(e), e]));

	const newRows = scraped
		.filter((e) => !existingByKey.has(key(e)))
		.map((e) => ({
			namespace: e.namespace,
			name: e.name,
			displayName: e.displayName,
			pinned: pinnedKeys.has(key(e)),
			iconUrl: e.iconUrl,
			description: e.description
		}));
	for (const c of chunk(newRows, ROW_CHUNK)) {
		await db.insert(extensions).values(c);
	}
	if (newRows.length > 0) console.log(`[scraper] Inserted ${newRows.length} new extensions`);

	// Refresh metadata that changed for known extensions
	const updates: Statement[] = [];
	for (const e of scraped) {
		const ex = existingByKey.get(key(e));
		if (!ex) continue;
		const pinned = ex.pinned || pinnedKeys.has(key(e));
		if (
			ex.displayName !== e.displayName ||
			ex.iconUrl !== e.iconUrl ||
			ex.description !== e.description ||
			ex.pinned !== pinned
		) {
			updates.push(
				db
					.update(extensions)
					.set({ displayName: e.displayName, iconUrl: e.iconUrl, description: e.description, pinned })
					.where(eq(extensions.id, ex.id))
			);
		}
	}
	await runBatched(updates);

	// Re-select for ids of freshly inserted rows
	const allExtensions = await db
		.select({ id: extensions.id, namespace: extensions.namespace, name: extensions.name })
		.from(extensions)
		.all();
	const idByKey = new Map(allExtensions.map((e) => [key(e), e.id]));

	// Previous latest version per extension, for version-change detection
	const prevRows = await db.all<{ extensionId: number; version: string }>(sql`
		select s.extension_id as extensionId, s.version as version
		from snapshots s
		join (
			select extension_id, max(date) as d
			from snapshots
			where date < ${date}
			group by extension_id
		) m on m.extension_id = s.extension_id and m.d = s.date
	`);
	const prevVersion = new Map(prevRows.map((r) => [r.extensionId, r.version]));

	// Upsert today's snapshots (update in case the scraper runs twice on the same day)
	const snapshotRows = scraped.map((e) => ({
		extensionId: idByKey.get(key(e))!,
		date,
		scrapedAt,
		downloadCount: e.downloadCount,
		version: e.version
	}));
	for (const c of chunk(snapshotRows, ROW_CHUNK)) {
		await db
			.insert(snapshots)
			.values(c)
			.onConflictDoUpdate({
				target: [snapshots.extensionId, snapshots.date],
				set: {
					downloadCount: sql`excluded.download_count`,
					version: sql`excluded.version`,
					scrapedAt: sql`excluded.scraped_at`
				}
			});
	}

	// Record version changes vs the most recent previous snapshot
	const events = snapshotRows
		.filter((r) => {
			const prev = prevVersion.get(r.extensionId);
			return prev !== undefined && prev !== r.version;
		})
		.map((r) => ({
			extensionId: r.extensionId,
			date,
			detectedAt: scrapedAt,
			oldVersion: prevVersion.get(r.extensionId)!,
			newVersion: r.version
		}));
	for (const c of chunk(events, ROW_CHUNK)) {
		await db
			.insert(versionEvents)
			.values(c)
			.onConflictDoUpdate({
				target: [versionEvents.extensionId, versionEvents.date],
				set: { newVersion: sql`excluded.new_version`, detectedAt: sql`excluded.detected_at` }
			});
	}
	if (events.length > 0) console.log(`[scraper] Recorded ${events.length} version changes`);

	console.log(`[scraper] Done. Scraped ${snapshotRows.length} extensions. Errors: ${errors.length}`);
	return { scraped: snapshotRows.length, errors };
}
