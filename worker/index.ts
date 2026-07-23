import { createClient, type Client } from '@libsql/client/web';
import type { ExtensionDetailJson, ExtensionRecord, OpenVsxSnapshot, VersionEvent, VsCodeSnapshot } from '../src/lib/types.js';

interface Env {
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN?: string;
	ALLOWED_ORIGIN?: string;
}

interface WorkerContext {
	waitUntil(promise: Promise<unknown>): void;
}

interface OpenVsxMeta {
	iconUrl: string | null;
	description: string | null;
	tags: string[];
	categories: string[];
	repoUrl: string | null;
	homepageUrl: string | null;
	bugsUrl: string | null;
}

const corsHeaders = (env: Env) => ({
	'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
});

function jsonResponse(env: Env, body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': init.status && init.status >= 400 ? 'no-store' : 'public, max-age=300',
			...corsHeaders(env),
			...init.headers
		}
	});
}

function createDb(env: Env) {
	if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL is not set');

	return createClient({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN
	});
}

async function fetchMeta(namespace: string, name: string): Promise<OpenVsxMeta | null> {
	try {
		const res = await fetch(`https://open-vsx.org/api/${namespace}/${name}`);
		if (!res.ok) return null;
		const d = await res.json() as {
			files?: { icon?: string };
			description?: string;
			tags?: string[];
			categories?: string[];
			repository?: string;
			homepage?: string;
			bugs?: string;
		};

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

async function upsertMeta(db: Client, extensionId: number, meta: OpenVsxMeta) {
	await db.execute({
		sql: 'update extensions set repo_url = ?, homepage_url = ?, bugs_url = ?, icon_url = ?, description = ? where id = ?',
		args: [meta.repoUrl, meta.homepageUrl, meta.bugsUrl, meta.iconUrl, meta.description, extensionId]
	});

	const allTags = [...new Set([...meta.tags, ...meta.categories])];
	await db.execute({ sql: 'delete from extension_tags where extension_id = ?', args: [extensionId] });

	if (allTags.length === 0) return;

	const placeholders = allTags.map(() => '(?, ?)').join(', ');
	const args = allTags.flatMap((tag) => [extensionId, tag]);
	await db.execute({
		sql: `insert into extension_tags (extension_id, tag) values ${placeholders}`,
		args
	});
}

async function getExtensionDetail(db: Client, namespace: string, name: string, ctx: WorkerContext): Promise<ExtensionDetailJson | null> {
	const extResult = await db.execute({
		sql: `
			select
				id,
				namespace,
				name,
				display_name as displayName,
				pinned,
				vscode_id as vsCodeId,
				icon_url as iconUrl,
				description,
				repo_url as repoUrl,
				homepage_url as homepageUrl,
				bugs_url as bugsUrl
			from extensions
			where namespace = ? and name = ?
			limit 1
		`,
		args: [namespace, name]
	});

	const ext = extResult.rows[0] as unknown as ExtensionRecord | undefined;
	if (!ext) return null;
	ext.pinned = Boolean(ext.pinned);

	// The daily scrape stores icon/description, so metadata is usually already
	// on hand — only block on the live Open VSX call when we have nothing yet,
	// and refresh stored metadata in the background otherwise.
	const hasStoredMeta = ext.iconUrl !== null || ext.description !== null;
	const metaPromise: Promise<OpenVsxMeta | null> = hasStoredMeta
		? Promise.resolve(null)
		: fetchMeta(namespace, name);
	if (hasStoredMeta) {
		ctx.waitUntil(fetchMeta(namespace, name).then((m) => (m ? upsertMeta(db, ext.id, m) : undefined)));
	}

	const [meta, historyResult, vsCodeResult, releaseResult, tagResult] = await Promise.all([
		metaPromise,
		db.execute({
			sql: `
				select date, scraped_at as scrapedAt, download_count as downloadCount, version
				from snapshots
				where extension_id = ?
				order by date asc
			`,
			args: [ext.id]
		}),
		ext.vsCodeId
			? db.execute({
					sql: `
						select date, scraped_at as scrapedAt, install_count as installCount
						from vscode_snapshots
						where extension_id = ?
						order by date asc
					`,
					args: [ext.id]
				})
			: Promise.resolve({ rows: [] }),
		db.execute({
			sql: `
				select id, date, detected_at as detectedAt, old_version as oldVersion, new_version as newVersion
				from version_events
				where extension_id = ?
				order by detected_at desc
			`,
			args: [ext.id]
		}),
		db.execute({
			sql: 'select tag from extension_tags where extension_id = ?',
			args: [ext.id]
		})
	]);

	if (meta) ctx.waitUntil(upsertMeta(db, ext.id, meta));

	const history = historyResult.rows as unknown as OpenVsxSnapshot[];
	const vsCodeHistory = vsCodeResult.rows as unknown as VsCodeSnapshot[];
	const releases = releaseResult.rows as unknown as VersionEvent[];
	const storedTags = tagResult.rows.map((row) => String(row.tag));
	const tags = meta ? [...new Set([...meta.tags, ...meta.categories])] : storedTags;

	return {
		ext,
		history,
		vsCodeHistory,
		releases,
		latest: history.at(-1) ?? null,
		latestVsCode: vsCodeHistory.at(-1) ?? null,
		tags,
		iconUrl: meta?.iconUrl ?? ext.iconUrl ?? null,
		description: meta?.description ?? ext.description ?? null,
		repoUrl: meta?.repoUrl ?? ext.repoUrl ?? null,
		homepageUrl: meta?.homepageUrl ?? ext.homepageUrl ?? null,
		bugsUrl: meta?.bugsUrl ?? ext.bugsUrl ?? null
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders(env) });
		}

		if (request.method !== 'GET') {
			return jsonResponse(env, { error: 'Method not allowed' }, { status: 405 });
		}

		const url = new URL(request.url);
		if (url.pathname !== '/api/extension') {
			return jsonResponse(env, { error: 'Not found' }, { status: 404 });
		}

		const namespace = url.searchParams.get('namespace');
		const name = url.searchParams.get('name');
		if (!namespace || !name) {
			return jsonResponse(env, { error: 'namespace and name are required' }, { status: 400 });
		}

		try {
			const db = createDb(env);
			const data = await getExtensionDetail(db, namespace, name, ctx);
			if (!data) return jsonResponse(env, { error: 'Extension not found' }, { status: 404 });
			return jsonResponse(env, data);
		} catch (error) {
			console.error('[worker] Failed to load extension detail', error);
			return jsonResponse(env, { error: 'Extension history is unavailable' }, { status: 500 });
		}
	}
};
