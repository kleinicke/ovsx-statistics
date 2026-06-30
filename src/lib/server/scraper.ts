import { db } from './db/index.js';
import { extensions, snapshots, versionEvents } from './db/schema.js';
import { eq, and } from 'drizzle-orm';

const OPENVSX_API = 'https://open-vsx.org/api';
const PAGE_SIZE = 100;

// Extensions that are always tracked regardless of rank
const PINNED = [
	{ namespace: 'kleinicke', name: 'ply-visualizer' },
	{ namespace: 'kleinicke', name: 'tiff-visualizer' },
	{ namespace: 'janosh', name: 'matterviz' }
];

interface OpenVsxExtension {
	namespace: string;
	name: string;
	displayName: string;
	version: string;
	downloadCount: number;
}

// Paginate until the API returns an empty page (hard limit ~10k).
// No arbitrary TOP_COUNT — we get everything the API exposes.
async function fetchAllExtensions(): Promise<OpenVsxExtension[]> {
	const results: OpenVsxExtension[] = [];
	let offset = 0;

	while (true) {
		const url = `${OPENVSX_API}/-/search?size=${PAGE_SIZE}&offset=${offset}&sortBy=downloadCount&sortOrder=desc`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Search failed at offset ${offset}: ${res.status}`);
		const data = await res.json();
		const batch: unknown[] = data.extensions ?? [];

		for (const ext of batch as OpenVsxExtension[]) {
			results.push({
				namespace: ext.namespace,
				name: ext.name,
				displayName: (ext as { displayName?: string }).displayName ?? ext.name,
				version: ext.version,
				downloadCount: (ext as { downloadCount?: number }).downloadCount ?? 0
			});
		}

		if (batch.length < PAGE_SIZE) break; // last page or API limit reached
		offset += PAGE_SIZE;
	}

	return results;
}

async function fetchExtension(namespace: string, name: string): Promise<OpenVsxExtension | null> {
	const res = await fetch(`${OPENVSX_API}/${namespace}/${name}`);
	if (!res.ok) return null;
	const data = await res.json();
	return {
		namespace: data.namespace,
		name: data.name,
		displayName: data.displayName ?? data.name,
		version: data.version,
		downloadCount: data.downloadCount ?? 0
	};
}

async function upsertExtension(
	namespace: string,
	name: string,
	displayName: string,
	pinned: boolean
): Promise<number> {
	const existing = await db
		.select()
		.from(extensions)
		.where(and(eq(extensions.namespace, namespace), eq(extensions.name, name)))
		.get();

	if (existing) {
		if (existing.pinned !== pinned && pinned) {
			await db.update(extensions).set({ pinned: true }).where(eq(extensions.id, existing.id));
		}
		return existing.id;
	}

	const result = await db
		.insert(extensions)
		.values({ namespace, name, displayName, pinned })
		.returning({ id: extensions.id });
	return result[0].id;
}

async function recordSnapshot(
	extensionId: number,
	date: string,
	scrapedAt: string,
	downloadCount: number,
	version: string
): Promise<void> {
	const existing = await db
		.select()
		.from(snapshots)
		.where(and(eq(snapshots.extensionId, extensionId), eq(snapshots.date, date)))
		.get();

	if (existing) {
		// Update in case the scraper runs twice on the same day
		await db
			.update(snapshots)
			.set({ downloadCount, version, scrapedAt })
			.where(eq(snapshots.id, existing.id));
		return;
	}

	// Check for version change vs most recent previous snapshot before inserting
	const prev = await db.query.snapshots.findFirst({
		where: and(eq(snapshots.extensionId, extensionId)),
		orderBy: (s, { desc }) => [desc(s.date)],
		columns: { version: true, date: true }
	});

	await db.insert(snapshots).values({ extensionId, date, scrapedAt, downloadCount, version });

	if (prev && prev.date !== date && prev.version !== version) {
		await db.insert(versionEvents).values({
			extensionId,
			date,
			detectedAt: scrapedAt,
			oldVersion: prev.version,
			newVersion: version
		});
	}
}

export async function runScrape(): Promise<{ scraped: number; errors: string[] }> {
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];
	let scraped = 0;

	console.log(`[scraper] Starting scrape for ${date}`);

	const topExts = await fetchAllExtensions();
	console.log(`[scraper] Fetched ${topExts.length} extensions from API`);
	const pinnedKeys = new Set(PINNED.map((p) => `${p.namespace}/${p.name}`));

	for (const ext of topExts) {
		try {
			const isPinned = pinnedKeys.has(`${ext.namespace}/${ext.name}`);
			const id = await upsertExtension(ext.namespace, ext.name, ext.displayName, isPinned);
			await recordSnapshot(id, date, scrapedAt, ext.downloadCount, ext.version);
			scraped++;
		} catch (e) {
			errors.push(`${ext.namespace}/${ext.name}: ${e}`);
		}
	}

	// Fetch pinned extensions not already in the top 200
	const topKeys = new Set(topExts.map((e) => `${e.namespace}/${e.name}`));
	for (const pinned of PINNED) {
		if (topKeys.has(`${pinned.namespace}/${pinned.name}`)) continue;
		try {
			const ext = await fetchExtension(pinned.namespace, pinned.name);
			if (!ext) {
				errors.push(`${pinned.namespace}/${pinned.name}: not found`);
				continue;
			}
			const id = await upsertExtension(ext.namespace, ext.name, ext.displayName, true);
			await recordSnapshot(id, date, scrapedAt, ext.downloadCount, ext.version);
			scraped++;
		} catch (e) {
			errors.push(`${pinned.namespace}/${pinned.name}: ${e}`);
		}
	}

	console.log(`[scraper] Done. Scraped ${scraped} extensions. Errors: ${errors.length}`);
	return { scraped, errors };
}
