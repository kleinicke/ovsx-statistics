import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { extensions, extensionTags, snapshots } from './db/schema.js';
import type { LatestJson } from '../types.js';

export async function getLatestRanking(): Promise<LatestJson> {
	const latestDate = await db
		.select({ date: snapshots.date })
		.from(snapshots)
		.orderBy(desc(snapshots.date))
		.limit(1)
		.get();

	if (!latestDate) {
		return { rows: [], latestDate: null, generatedAt: new Date().toISOString() };
	}

	const date = latestDate.date;

	const prevDate = await db
		.select({ date: snapshots.date })
		.from(snapshots)
		.where(sql`${snapshots.date} < ${date}`)
		.orderBy(desc(snapshots.date))
		.limit(1)
		.get();

	const current = await db
		.select({
			id: extensions.id,
			namespace: extensions.namespace,
			name: extensions.name,
			displayName: extensions.displayName,
			pinned: extensions.pinned,
			downloadCount: snapshots.downloadCount,
			version: snapshots.version
		})
		.from(snapshots)
		.innerJoin(extensions, eq(snapshots.extensionId, extensions.id))
		.where(eq(snapshots.date, date))
		.orderBy(desc(snapshots.downloadCount))
		.all();

	let prevMap = new Map<number, number>();
	if (prevDate) {
		const prev = await db
			.select({ extensionId: snapshots.extensionId, downloadCount: snapshots.downloadCount })
			.from(snapshots)
			.where(eq(snapshots.date, prevDate.date))
			.all();
		prevMap = new Map(prev.map((p) => [p.extensionId, p.downloadCount]));
	}

	const tagRows = await db
		.select({ extensionId: extensionTags.extensionId, tag: extensionTags.tag })
		.from(extensionTags)
		.all();

	const tagsByExtension = new Map<number, string[]>();
	for (const { extensionId, tag } of tagRows) {
		const list = tagsByExtension.get(extensionId) ?? [];
		list.push(tag);
		tagsByExtension.set(extensionId, list);
	}

	const rows = current.map((row, index) => ({
		rank: index + 1,
		...row,
		delta: prevMap.has(row.id) ? row.downloadCount - prevMap.get(row.id)! : null,
		tags: tagsByExtension.get(row.id) ?? []
	}));

	return {
		rows,
		latestDate: date,
		generatedAt: new Date().toISOString()
	};
}
