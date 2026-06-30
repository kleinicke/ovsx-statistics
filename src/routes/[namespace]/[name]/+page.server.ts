import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { extensions, snapshots, versionEvents, vsCodeSnapshots, extensionTags } from '$lib/server/db/schema.js';
import { and, asc, desc, eq } from 'drizzle-orm';

interface OpenVsxMeta {
	iconUrl: string | null;
	description: string | null;
	tags: string[];
	categories: string[];
	repoUrl: string | null;
	homepageUrl: string | null;
	bugsUrl: string | null;
}

async function fetchMeta(namespace: string, name: string): Promise<OpenVsxMeta | null> {
	try {
		const res = await fetch(`https://open-vsx.org/api/${namespace}/${name}`);
		if (!res.ok) return null;
		const d = await res.json();
		return {
			iconUrl: d.files?.icon ?? null,
			description: d.description ?? null,
			tags: d.tags ?? [],
			categories: d.categories ?? [],
			repoUrl: d.repository ?? null,
			homepageUrl: d.homepage ?? null,
			bugsUrl: d.bugs ?? null
		};
	} catch {
		return null;
	}
}

async function upsertMeta(extId: number, meta: OpenVsxMeta) {
	// Update links on the extension row
	await db.update(extensions).set({
		repoUrl: meta.repoUrl,
		homepageUrl: meta.homepageUrl,
		bugsUrl: meta.bugsUrl
	}).where(eq(extensions.id, extId));

	// Replace tags: delete old, insert new
	const allTags = [...new Set([...meta.tags, ...meta.categories])];
	await db.delete(extensionTags).where(eq(extensionTags.extensionId, extId));
	if (allTags.length > 0) {
		await db.insert(extensionTags).values(allTags.map((tag) => ({ extensionId: extId, tag })));
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const ext = await db
		.select()
		.from(extensions)
		.where(and(eq(extensions.namespace, params.namespace), eq(extensions.name, params.name)))
		.get();

	if (!ext) error(404, 'Extension not found');

	// Fetch live metadata from Open VSX (icon + description served from their CDN, tags stored in our DB)
	const [meta, history, vsCodeHistory, releases, storedTags] = await Promise.all([
		fetchMeta(params.namespace, params.name),
		db.select({ date: snapshots.date, scrapedAt: snapshots.scrapedAt, downloadCount: snapshots.downloadCount, version: snapshots.version })
			.from(snapshots).where(eq(snapshots.extensionId, ext.id)).orderBy(asc(snapshots.date)).all(),
		ext.vsCodeId
			? db.select({ date: vsCodeSnapshots.date, scrapedAt: vsCodeSnapshots.scrapedAt, installCount: vsCodeSnapshots.installCount })
				.from(vsCodeSnapshots).where(eq(vsCodeSnapshots.extensionId, ext.id)).orderBy(asc(vsCodeSnapshots.date)).all()
			: Promise.resolve([]),
		db.select({ id: versionEvents.id, date: versionEvents.date, detectedAt: versionEvents.detectedAt, oldVersion: versionEvents.oldVersion, newVersion: versionEvents.newVersion })
			.from(versionEvents).where(eq(versionEvents.extensionId, ext.id)).orderBy(desc(versionEvents.detectedAt)).all(),
		db.select({ tag: extensionTags.tag }).from(extensionTags).where(eq(extensionTags.extensionId, ext.id)).all()
	]);

	// Upsert metadata to DB in the background (don't block the response)
	if (meta) upsertMeta(ext.id, meta).catch(() => {});

	const latest = history.at(-1) ?? null;
	const latestVsCode = vsCodeHistory.at(-1) ?? null;

	// Prefer freshly fetched tags; fall back to stored if API failed
	const tags = meta ? [...new Set([...meta.tags, ...meta.categories])] : storedTags.map((r) => r.tag);

	return {
		ext,
		history,
		vsCodeHistory,
		releases,
		latest,
		latestVsCode,
		tags,
		iconUrl: meta?.iconUrl ?? null,
		description: meta?.description ?? null,
		repoUrl: meta?.repoUrl ?? ext.repoUrl ?? null,
		homepageUrl: meta?.homepageUrl ?? ext.homepageUrl ?? null,
		bugsUrl: meta?.bugsUrl ?? ext.bugsUrl ?? null
	};
};
