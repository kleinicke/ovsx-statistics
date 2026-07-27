import { db } from './db/index.js';
import { extensions, vsCodeSnapshots } from './db/schema.js';
import { and, eq, isNotNull, isNull, inArray, lt, or, sql } from 'drizzle-orm';
import { chunk, fetchJson } from './http.js';

const VSCODE_API = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const BATCH_SIZE = 100;
const ROW_CHUNK = 400;
const RECHECK_AFTER_DAYS = 30; // retry discovery for unmatched extensions this often

interface GalleryExtension {
	publisher: { publisherName: string };
	extensionName: string;
	statistics?: { statisticName: string; value: number }[];
}

async function fetchInstalls(vsCodeIds: string[]): Promise<Map<string, number>> {
	const result = new Map<string, number>();

	for (const batch of chunk(vsCodeIds, BATCH_SIZE)) {
		const data = await fetchJson<{ results?: { extensions?: GalleryExtension[] }[] }>(VSCODE_API, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=3.0-preview.1',
				'User-Agent': 'vscode-extension-tracker/1.0'
			},
			body: JSON.stringify({
				filters: [{
					criteria: batch.map((id) => ({ filterType: 7, value: id })),
					pageSize: BATCH_SIZE,
					pageNumber: 1
				}],
				flags: 914
			})
		});

		for (const ext of data.results?.[0]?.extensions ?? []) {
			const id = `${ext.publisher.publisherName}.${ext.extensionName}`;
			const installs = ext.statistics?.find((s) => s.statisticName === 'install')?.value ?? 0;
			result.set(id.toLowerCase(), installs);
		}
	}

	return result;
}

// Discovery: try namespace.name as the VS Code ID for extensions without one.
// Unmatched extensions are stamped with vscode_checked_at and retried after
// RECHECK_AFTER_DAYS, so each run only queries new or stale candidates.
export async function discoverVscodeIds(
	options: { force?: boolean } = {}
): Promise<{ discovered: number; checked: number }> {
	const cutoff = new Date(Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

	// Normal runs only look at never-checked or stale candidates. A forced sweep
	// re-checks every extension that still lacks a vscode_id, ignoring the gate.
	const staleFilter = options.force
		? isNull(extensions.vsCodeId)
		: and(
				isNull(extensions.vsCodeId),
				or(isNull(extensions.vsCodeCheckedAt), lt(extensions.vsCodeCheckedAt, cutoff))
			);

	const candidates = await db
		.select({ id: extensions.id, namespace: extensions.namespace, name: extensions.name })
		.from(extensions)
		.where(staleFilter)
		.all();

	if (candidates.length === 0) return { discovered: 0, checked: 0 };

	const found = await fetchInstalls(candidates.map((e) => `${e.namespace}.${e.name}`));
	const checkedAt = new Date().toISOString();

	// Stamp every candidate as checked, then set vscode_id on the matches.
	// The install snapshot itself is taken by scrapeVscodeInstalls right after.
	for (const c of chunk(candidates, ROW_CHUNK)) {
		await db
			.update(extensions)
			.set({ vsCodeCheckedAt: checkedAt })
			.where(inArray(extensions.id, c.map((e) => e.id)));
	}

	const matches = candidates.filter((e) => found.has(`${e.namespace}.${e.name}`.toLowerCase()));
	for (const ext of matches) {
		await db
			.update(extensions)
			.set({ vsCodeId: `${ext.namespace}.${ext.name}` })
			.where(eq(extensions.id, ext.id));
	}

	console.log(`[vscode-discover] ${matches.length}/${candidates.length} found on VS Code Marketplace`);
	return { discovered: matches.length, checked: candidates.length };
}

// Daily scrape: fetch install counts for all extensions with a known vscode_id.
export async function scrapeVscodeInstalls(): Promise<{ scraped: number; errors: string[] }> {
	const known = await db
		.select({ id: extensions.id, vsCodeId: extensions.vsCodeId })
		.from(extensions)
		.where(isNotNull(extensions.vsCodeId))
		.all();

	if (known.length === 0) return { scraped: 0, errors: [] };

	const counts = await fetchInstalls(known.map((e) => e.vsCodeId!));

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];

	const rows: (typeof vsCodeSnapshots.$inferInsert)[] = [];
	for (const ext of known) {
		const count = counts.get(ext.vsCodeId!.toLowerCase());
		if (count === undefined) {
			errors.push(`${ext.vsCodeId}: not returned`);
			continue;
		}
		rows.push({ extensionId: ext.id, date, scrapedAt, installCount: count });
	}

	// Upsert so a same-day rerun updates instead of duplicating
	for (const c of chunk(rows, ROW_CHUNK)) {
		await db
			.insert(vsCodeSnapshots)
			.values(c)
			.onConflictDoUpdate({
				target: [vsCodeSnapshots.extensionId, vsCodeSnapshots.date],
				set: { installCount: sql`excluded.install_count`, scrapedAt: sql`excluded.scraped_at` }
			});
	}

	console.log(`[vscode-scraper] Scraped ${rows.length} extensions. Errors: ${errors.length}`);
	return { scraped: rows.length, errors };
}
