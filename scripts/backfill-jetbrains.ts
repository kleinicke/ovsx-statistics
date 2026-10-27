import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/lib/server/db/index.js';
import { extensions, jetbrainsSnapshots } from '../src/lib/server/db/schema.js';

// One-off manual checkpoints (cumulative, non-unique downloads) from the
// JetBrains vendor statistics, from before the daily scraper existed.
const CHECKPOINTS: { name: string; points: [date: string, downloads: number][] }[] = [
	{ name: 'ply-visualizer', points: [['2026-09-07', 0], ['2026-09-30', 282]] },
	{ name: 'tiff-visualizer', points: [['2026-09-22', 0], ['2026-09-30', 92]] }
];

for (const { name, points } of CHECKPOINTS) {
	const ext = await db
		.select({ id: extensions.id })
		.from(extensions)
		.where(and(eq(extensions.namespace, 'kleinicke'), eq(extensions.name, name)))
		.get();
	if (!ext) throw new Error(`extension kleinicke/${name} not found`);

	for (const [date, downloadCount] of points) {
		await db
			.insert(jetbrainsSnapshots)
			.values({ extensionId: ext.id, date, scrapedAt: `${date}T00:00:00.000Z`, downloadCount })
			.onConflictDoUpdate({
				target: [jetbrainsSnapshots.extensionId, jetbrainsSnapshots.date],
				set: { downloadCount: sql`excluded.download_count`, scrapedAt: sql`excluded.scraped_at` }
			});
		console.log(`${name} ${date} -> ${downloadCount}`);
	}
}
