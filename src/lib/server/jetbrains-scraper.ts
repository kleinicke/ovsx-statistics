import { db } from './db/index.js';
import { extensions, jetbrainsSnapshots } from './db/schema.js';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { fetchJson } from './http.js';
import { saveMetrics } from './metrics.js';

const JETBRAINS_API = 'https://plugins.jetbrains.com/api/plugins';

// Open VSX extension → JetBrains Marketplace plugin ID. Only a handful of
// extensions are published there, so there is no discovery step.
const JETBRAINS_PLUGINS: { namespace: string; name: string; pluginId: number }[] = [
	{ namespace: 'kleinicke', name: 'tiff-visualizer', pluginId: 34426 },
	{ namespace: 'kleinicke', name: 'ply-visualizer', pluginId: 34145 }
];

// Daily scrape: the public API only exposes the cumulative, non-unique download
// count (unique downloads are only visible in the vendor statistics), so daily
// numbers are derived from consecutive snapshots like for the other sources.
export async function scrapeJetbrainsDownloads(): Promise<{ scraped: number; errors: string[] }> {
	for (const p of JETBRAINS_PLUGINS) {
		await db
			.update(extensions)
			.set({ jetbrainsId: p.pluginId })
			.where(and(eq(extensions.namespace, p.namespace), eq(extensions.name, p.name)));
	}

	const known = await db
		.select({ id: extensions.id, jetbrainsId: extensions.jetbrainsId })
		.from(extensions)
		.where(isNotNull(extensions.jetbrainsId))
		.all();

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];
	let scraped = 0;

	for (const ext of known) {
		try {
			const data = await fetchJson<{ downloads?: number }>(`${JETBRAINS_API}/${ext.jetbrainsId}`);
			if (typeof data.downloads !== 'number') {
				errors.push(`${ext.jetbrainsId}: no download count returned`);
				continue;
			}
			await db
				.insert(jetbrainsSnapshots)
				.values({ extensionId: ext.id, date, scrapedAt, downloadCount: data.downloads })
				.onConflictDoUpdate({
					target: [jetbrainsSnapshots.extensionId, jetbrainsSnapshots.date],
					set: { downloadCount: sql`excluded.download_count`, scrapedAt: sql`excluded.scraped_at` }
				});
			// Per-version count of the newest release, from the updates endpoint
			const updates = await fetchJson<{ downloads?: number }[]>(`${JETBRAINS_API}/${ext.jetbrainsId}/updates`);
			await saveMetrics(ext.id, date, {
				downloads: data.downloads,
				...(typeof updates[0]?.downloads === 'number' && { version_downloads: updates[0].downloads })
			});
			scraped++;
		} catch (e) {
			errors.push(`${ext.jetbrainsId}: ${e}`);
		}
	}

	console.log(`[jetbrains-scraper] Scraped ${scraped} plugins. Errors: ${errors.length}`);
	return { scraped, errors };
}
