import { db } from './db/index.js';
import { extensions, vsCodeSnapshots } from './db/schema.js';
import { and, eq, isNotNull, isNull, inArray } from 'drizzle-orm';

const VSCODE_API = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const BATCH_SIZE = 100;

async function fetchInstalls(vsCodeIds: string[]): Promise<Map<string, number>> {
	const result = new Map<string, number>();

	for (let i = 0; i < vsCodeIds.length; i += BATCH_SIZE) {
		const batch = vsCodeIds.slice(i, i + BATCH_SIZE);
		const res = await fetch(VSCODE_API, {
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

		if (!res.ok) throw new Error(`VS Code API failed: ${res.status}`);
		const data = await res.json();

		for (const ext of data.results?.[0]?.extensions ?? []) {
			const id = `${ext.publisher.publisherName}.${ext.extensionName}`;
			const installs = ext.statistics?.find(
				(s: { statisticName: string }) => s.statisticName === 'install'
			)?.value ?? 0;
			result.set(id.toLowerCase(), installs);
		}
	}

	return result;
}

// One-time discovery: try namespace.name as the VS Code ID for extensions that
// don't have one yet. Stores vscode_id and the first install snapshot if found.
export async function discoverVscodeIds(
	extensionDbIds: number[]
): Promise<{ discovered: number; checked: number }> {
	const candidates = await db
		.select()
		.from(extensions)
		.where(and(isNull(extensions.vsCodeId), inArray(extensions.id, extensionDbIds)))
		.all();

	if (candidates.length === 0) return { discovered: 0, checked: 0 };

	const candidateIds = candidates.map((e) => `${e.namespace}.${e.name}`);
	const found = await fetchInstalls(candidateIds);

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	let discovered = 0;

	for (const ext of candidates) {
		const key = `${ext.namespace}.${ext.name}`.toLowerCase();
		if (!found.has(key)) continue;

		await db.update(extensions).set({ vsCodeId: `${ext.namespace}.${ext.name}` }).where(eq(extensions.id, ext.id));
		await db.insert(vsCodeSnapshots).values({
			extensionId: ext.id,
			date,
			scrapedAt,
			installCount: found.get(key)!
		});
		discovered++;
	}

	console.log(`[vscode-discover] ${discovered}/${candidates.length} found on VS Code Marketplace`);
	return { discovered, checked: candidates.length };
}

// Daily scrape: fetch install counts for all extensions with a known vscode_id.
export async function scrapeVscodeInstalls(): Promise<{ scraped: number; errors: string[] }> {
	const known = await db
		.select({ id: extensions.id, vsCodeId: extensions.vsCodeId })
		.from(extensions)
		.where(isNotNull(extensions.vsCodeId))
		.all();

	if (known.length === 0) return { scraped: 0, errors: [] };

	const ids = known.map((e) => e.vsCodeId!);
	const counts = await fetchInstalls(ids);

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	let scraped = 0;
	const errors: string[] = [];

	for (const ext of known) {
		const count = counts.get(ext.vsCodeId!.toLowerCase());
		if (count === undefined) {
			errors.push(`${ext.vsCodeId}: not returned`);
			continue;
		}

		const existing = await db
			.select({ id: vsCodeSnapshots.id })
			.from(vsCodeSnapshots)
			.where(and(eq(vsCodeSnapshots.extensionId, ext.id), eq(vsCodeSnapshots.date, date)))
			.get();

		if (existing) {
			await db
				.update(vsCodeSnapshots)
				.set({ installCount: count, scrapedAt })
				.where(eq(vsCodeSnapshots.id, existing.id));
		} else {
			await db.insert(vsCodeSnapshots).values({ extensionId: ext.id, date, scrapedAt, installCount: count });
		}
		scraped++;
	}

	console.log(`[vscode-scraper] Scraped ${scraped} extensions. Errors: ${errors.length}`);
	return { scraped, errors };
}
