import { desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { extensions, extensionTags, snapshots } from './db/schema.js';
import type { LatestAllJson, LatestJson, LeaderboardRow } from '../types.js';

const TOP_LIMIT = 500; // rows shipped eagerly in latest.json
const SPARKLINE_POINTS = 15; // cumulative points → up to 14 daily deltas
const MOVERS_LIMIT = 5;

interface FullRow extends LeaderboardRow {
	pinned: boolean;
	delta: number | null;
	delta7: number | null;
	rankDelta: number | null;
	iconUrl: string | null;
	tags: string[];
}

// Rows for latest-all.json: drop icons/sparklines and omit empty optional
// fields so the 10k-row payload stays as small as possible.
function slim(row: FullRow): LeaderboardRow {
	const r: LeaderboardRow = {
		rank: row.rank,
		id: row.id,
		namespace: row.namespace,
		name: row.name,
		displayName: row.displayName,
		downloadCount: row.downloadCount,
		version: row.version
	};
	if (row.pinned) r.pinned = true;
	if (row.delta !== null) r.delta = row.delta;
	if (row.delta7 !== null) r.delta7 = row.delta7;
	if (row.rankDelta !== null) r.rankDelta = row.rankDelta;
	if (row.tags.length > 0) r.tags = row.tags;
	return r;
}

async function countsForDate(date: string): Promise<Map<number, number>> {
	const rows = await db
		.select({ extensionId: snapshots.extensionId, downloadCount: snapshots.downloadCount })
		.from(snapshots)
		.where(eq(snapshots.date, date))
		.all();
	return new Map(rows.map((r) => [r.extensionId, r.downloadCount]));
}

export async function getLatestExports(): Promise<{ latest: LatestJson; all: LatestAllJson }> {
	const generatedAt = new Date().toISOString();
	const empty = {
		latest: { rows: [], movers: [], totalCount: 0, latestDate: null, generatedAt },
		all: { rows: [], latestDate: null, generatedAt }
	};

	const latestDate = await db
		.select({ date: snapshots.date })
		.from(snapshots)
		.orderBy(desc(snapshots.date))
		.limit(1)
		.get();
	if (!latestDate) return empty;
	const date = latestDate.date;

	const current = await db
		.select({
			id: extensions.id,
			namespace: extensions.namespace,
			name: extensions.name,
			displayName: extensions.displayName,
			pinned: extensions.pinned,
			iconUrl: extensions.iconUrl,
			downloadCount: snapshots.downloadCount,
			version: snapshots.version
		})
		.from(snapshots)
		.innerJoin(extensions, eq(snapshots.extensionId, extensions.id))
		.where(eq(snapshots.date, date))
		.orderBy(desc(snapshots.downloadCount))
		.all();

	// Comparison dates: previous snapshot (~24h) and closest snapshot ≥7 days back
	const prevDate = await db
		.select({ date: snapshots.date })
		.from(snapshots)
		.where(sql`${snapshots.date} < ${date}`)
		.orderBy(desc(snapshots.date))
		.limit(1)
		.get();

	const cutoff = new Date(`${date}T00:00:00Z`);
	cutoff.setUTCDate(cutoff.getUTCDate() - 7);
	const weekDate = await db
		.select({ date: snapshots.date })
		.from(snapshots)
		.where(lte(snapshots.date, cutoff.toISOString().slice(0, 10)))
		.orderBy(desc(snapshots.date))
		.limit(1)
		.get();

	const prevCounts = prevDate ? await countsForDate(prevDate.date) : new Map<number, number>();
	const weekCounts = weekDate ? await countsForDate(weekDate.date) : new Map<number, number>();

	// Previous ranking, for rank-change arrows
	const prevRank = new Map<number, number>();
	[...prevCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.forEach(([extensionId], index) => prevRank.set(extensionId, index + 1));

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

	const fullRows: FullRow[] = current.map((row, index) => {
		const rank = index + 1;
		const prev = prevCounts.get(row.id);
		const week = weekCounts.get(row.id);
		const oldRank = prevRank.get(row.id);
		return {
			rank,
			id: row.id,
			namespace: row.namespace,
			name: row.name,
			displayName: row.displayName,
			downloadCount: row.downloadCount,
			version: row.version,
			pinned: row.pinned,
			iconUrl: row.iconUrl,
			delta: prev !== undefined ? row.downloadCount - prev : null,
			delta7: week !== undefined ? row.downloadCount - week : null,
			rankDelta: oldRank !== undefined ? oldRank - rank : null,
			tags: tagsByExtension.get(row.id) ?? []
		};
	});

	// Sparklines (daily new downloads) for the eagerly-shipped rows only
	const topRows = fullRows.filter((r) => r.rank <= TOP_LIMIT || r.pinned);
	const sparkDates = (
		await db
			.selectDistinct({ date: snapshots.date })
			.from(snapshots)
			.orderBy(desc(snapshots.date))
			.limit(SPARKLINE_POINTS)
			.all()
	)
		.map((r) => r.date)
		.sort();

	if (sparkDates.length >= 2) {
		const topIds = topRows.map((r) => r.id);
		const sparkRows = await db
			.select({
				extensionId: snapshots.extensionId,
				date: snapshots.date,
				downloadCount: snapshots.downloadCount
			})
			.from(snapshots)
			.where(sql`${inArray(snapshots.extensionId, topIds)} and ${inArray(snapshots.date, sparkDates)}`)
			.all();

		const countsById = new Map<number, Map<string, number>>();
		for (const r of sparkRows) {
			const m = countsById.get(r.extensionId) ?? new Map<string, number>();
			m.set(r.date, r.downloadCount);
			countsById.set(r.extensionId, m);
		}

		for (const row of topRows) {
			const byDate = countsById.get(row.id);
			if (!byDate) continue;
			const deltas: (number | null)[] = [];
			for (let i = 1; i < sparkDates.length; i++) {
				const prev = byDate.get(sparkDates[i - 1]);
				const curr = byDate.get(sparkDates[i]);
				deltas.push(prev !== undefined && curr !== undefined ? curr - prev : null);
			}
			if (deltas.some((d) => d !== null)) row.sparkline = deltas;
		}
	}

	// Biggest gainers over the last week (falls back to 24h until a week of data exists)
	const movers = [...fullRows]
		.map((r) => ({ row: r, gain: r.delta7 ?? r.delta ?? 0 }))
		.filter((m) => m.gain > 0)
		.sort((a, b) => b.gain - a.gain)
		.slice(0, MOVERS_LIMIT)
		.map((m) => m.row);

	return {
		latest: {
			rows: topRows,
			movers,
			totalCount: fullRows.length,
			latestDate: date,
			generatedAt
		},
		all: {
			rows: fullRows.map(slim),
			latestDate: date,
			generatedAt
		}
	};
}
