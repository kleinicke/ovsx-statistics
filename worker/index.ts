import { createClient } from '@libsql/client/web';
import type { ExtensionDetailJson, ExtensionRecord, OpenVsxSnapshot, VersionEvent, VsCodeSnapshot } from '../src/lib/types.js';

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
			'Cache-Control':
				init.status && init.status >= 400
					? 'no-store'
					: 'public, max-age=300, s-maxage=3600',
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

async function getExtensionDetail(
	db: ReturnType<typeof createDb>,
	namespace: string,
	name: string
): Promise<ExtensionDetailJson | null> {
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

	const [historyResult, vsCodeResult, releaseResult, tagResult] = await Promise.all([
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

	const history = historyResult.rows as unknown as OpenVsxSnapshot[];
	const vsCodeHistory = vsCodeResult.rows as unknown as VsCodeSnapshot[];
	const releases = releaseResult.rows as unknown as VersionEvent[];
	const tags = tagResult.rows.map((row) => String(row.tag));

	return {
		ext,
		history,
		vsCodeHistory,
		releases,
		latest: history.at(-1) ?? null,
		latestVsCode: vsCodeHistory.at(-1) ?? null,
		tags,
		iconUrl: ext.iconUrl ?? null,
		description: ext.description ?? null,
		repoUrl: ext.repoUrl ?? null,
		homepageUrl: ext.homepageUrl ?? null,
		bugsUrl: ext.bugsUrl ?? null
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
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
			const data = await getExtensionDetail(db, namespace, name);
			if (!data) return jsonResponse(env, { error: 'Extension not found' }, { status: 404 });
			return jsonResponse(env, data);
		} catch (error) {
			console.error('[worker] Failed to load extension detail', error);
			return jsonResponse(env, { error: 'Extension history is unavailable' }, { status: 500 });
		}
	}
};
