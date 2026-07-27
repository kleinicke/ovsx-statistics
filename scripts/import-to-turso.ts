import 'dotenv/config';
import { createClient, type InStatement } from '@libsql/client';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , sourceArg] = process.argv;
if (!sourceArg) {
	console.error('Usage: pnpm import:turso <cleaned-local.db>');
	process.exit(1);
}
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
	throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be set');
}

const sourcePath = resolve(sourceArg);
if (!existsSync(sourcePath)) throw new Error(`Source does not exist: ${sourcePath}`);

const source = new DatabaseSync(sourcePath, { readOnly: true });
const remote = createClient({
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN
});

const remoteCount = await remote.execute('select count(*) as count from extensions');
if (Number(remoteCount.rows[0]?.count ?? 0) !== 0) {
	throw new Error('Remote extensions table is not empty; refusing to import over existing data');
}

interface TableSpec {
	name: string;
	columns: string[];
}

const tables: TableSpec[] = [
	{
		name: 'extensions',
		columns: [
			'id',
			'namespace',
			'name',
			'display_name',
			'pinned',
			'vscode_id',
			'vscode_checked_at',
			'icon_url',
			'description',
			'repo_url',
			'homepage_url',
			'bugs_url'
		]
	},
	{
		name: 'snapshots',
		columns: ['id', 'extension_id', 'date', 'scraped_at', 'download_count', 'version']
	},
	{
		name: 'vscode_snapshots',
		columns: ['id', 'extension_id', 'date', 'scraped_at', 'install_count']
	},
	{
		name: 'extension_tags',
		columns: ['id', 'extension_id', 'tag']
	},
	{
		name: 'version_events',
		columns: ['id', 'extension_id', 'date', 'detected_at', 'old_version', 'new_version']
	}
];

const ROWS_PER_STATEMENT = 250;
const STATEMENTS_PER_BATCH = 20;

for (const table of tables) {
	const total = Number(
		(source.prepare(`select count(*) as count from ${table.name}`).get() as { count: number }).count
	);
	console.log(`[import-turso] ${table.name}: importing ${total} rows`);

	const select = source.prepare(
		`select ${table.columns.join(', ')} from ${table.name} order by id limit ? offset ?`
	);
	let offset = 0;

	while (offset < total) {
		const statements: InStatement[] = [];
		for (let batchIndex = 0; batchIndex < STATEMENTS_PER_BATCH && offset < total; batchIndex++) {
			const rows = select.all(ROWS_PER_STATEMENT, offset) as Record<
				string,
				string | number | bigint | null
			>[];
			if (rows.length === 0) break;

			const placeholders = rows
				.map(() => `(${table.columns.map(() => '?').join(',')})`)
				.join(',');
			statements.push({
				sql: `insert into ${table.name} (${table.columns.join(',')}) values ${placeholders}`,
				args: rows.flatMap((row) => table.columns.map((column) => row[column]))
			});
			offset += rows.length;
		}

		await remote.batch(statements, 'write');
		console.log(`[import-turso] ${table.name}: ${Math.min(offset, total)}/${total}`);
	}
}

for (const table of tables) {
	const localCount = Number(
		(source.prepare(`select count(*) as count from ${table.name}`).get() as { count: number }).count
	);
	const result = await remote.execute(`select count(*) as count from ${table.name}`);
	const remoteCountForTable = Number(result.rows[0]?.count ?? 0);
	if (remoteCountForTable !== localCount) {
		throw new Error(
			`${table.name} count mismatch: local=${localCount}, remote=${remoteCountForTable}`
		);
	}
}

console.log('[import-turso] Import complete and row counts verified');
source.close();
remote.close();
