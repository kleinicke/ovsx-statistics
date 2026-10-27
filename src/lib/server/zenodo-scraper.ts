import { db } from './db/index.js';
import { extensions, extensionTags, snapshots } from './db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { fetchJson } from './http.js';
import { saveMetrics } from './metrics.js';
import { ZENODO_NAMESPACE } from '../utils.js';

const ZENODO_API = 'https://zenodo.org/api/records';

// Searchable on the leaderboard: the search box also matches tags
const AUTHOR_TAG = 'Martha Nick';

// Zenodo record IDs to track. They are stored as pseudo-extensions in the
// `zenodo` namespace, so snapshots, history and the detail page work unchanged.
const ZENODO_RECORDS = [15061688];

interface ZenodoRecord {
	metadata: { title: string; version?: string; description?: string };
	links: { self_html?: string };
	stats: {
		downloads: number;
		unique_downloads: number;
		views: number;
		unique_views: number;
		version_downloads: number;
		version_unique_downloads: number;
		version_views: number;
		version_unique_views: number;
	};
}

// Zenodo only exposes cumulative counts, so daily numbers are derived from
// consecutive snapshots. The charted series is `unique_downloads` (all versions),
// which is what the record page shows; every other number goes to source_metrics.
export async function scrapeZenodoDownloads(): Promise<{ scraped: number; errors: string[] }> {
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];
	let scraped = 0;

	for (const recordId of ZENODO_RECORDS) {
		try {
			const record = await fetchJson<ZenodoRecord>(`${ZENODO_API}/${recordId}`, {
				headers: { 'User-Agent': 'vscode-extension-tracker/1.0', Accept: 'application/json' }
			});
			const downloads = record.stats?.unique_downloads;
			if (typeof downloads !== 'number') {
				errors.push(`${recordId}: no unique download count returned`);
				continue;
			}

			const name = String(recordId);
			const meta = {
				displayName: record.metadata.title,
				description: record.metadata.description?.replace(/<[^>]*>/g, '').trim().slice(0, 300) || null,
				repoUrl: record.links.self_html ?? `https://zenodo.org/records/${recordId}`,
				pinned: true
			};

			await db
				.insert(extensions)
				.values({ namespace: ZENODO_NAMESPACE, name, ...meta })
				.onConflictDoUpdate({
					target: [extensions.namespace, extensions.name],
					set: meta
				});
			const ext = await db
				.select({ id: extensions.id })
				.from(extensions)
				.where(and(eq(extensions.namespace, ZENODO_NAMESPACE), eq(extensions.name, name)))
				.get();

			await db
				.insert(extensionTags)
				.values({ extensionId: ext!.id, tag: AUTHOR_TAG })
				.onConflictDoNothing();

			await db
				.insert(snapshots)
				.values({
					extensionId: ext!.id,
					date,
					scrapedAt,
					downloadCount: downloads,
					version: record.metadata.version ?? '1'
				})
				.onConflictDoUpdate({
					target: [snapshots.extensionId, snapshots.date],
					set: {
						downloadCount: sql`excluded.download_count`,
						version: sql`excluded.version`,
						scrapedAt: sql`excluded.scraped_at`
					}
				});
			const st = record.stats;
			await saveMetrics(ext!.id, date, {
				unique_downloads: st.unique_downloads,
				downloads: st.downloads,
				unique_views: st.unique_views,
				views: st.views,
				version_unique_downloads: st.version_unique_downloads,
				version_downloads: st.version_downloads,
				version_unique_views: st.version_unique_views,
				version_views: st.version_views
			});
			scraped++;
		} catch (e) {
			errors.push(`${recordId}: ${e}`);
		}
	}

	console.log(`[zenodo-scraper] Scraped ${scraped} records. Errors: ${errors.length}`);
	return { scraped, errors };
}
