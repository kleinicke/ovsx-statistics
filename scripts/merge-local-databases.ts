import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , targetArg, ...sourceArgs] = process.argv;

if (!targetArg || sourceArgs.length === 0) {
	console.error(
		'Usage: pnpm merge:local <migrated-target.db> <oldest-source.db> [...newest-source.db]'
	);
	process.exit(1);
}

const targetPath = resolve(targetArg);
const sourcePaths = sourceArgs.map((path) => resolve(path));

if (!existsSync(targetPath)) {
	throw new Error(`Target does not exist: ${targetPath}. Create it with pnpm db:migrate first.`);
}
for (const path of sourcePaths) {
	if (!existsSync(path)) throw new Error(`Source does not exist: ${path}`);
	if (path === targetPath) throw new Error('The target cannot also be a source');
}

const db = new DatabaseSync(targetPath);
db.exec('PRAGMA foreign_keys = ON');

function quote(value: string) {
	return `'${value.replaceAll("'", "''")}'`;
}

function columns(schema: string, table: string): Set<string> {
	const rows = db.prepare(`PRAGMA ${schema}.table_info(${table})`).all() as { name: string }[];
	return new Set(rows.map((row) => row.name));
}

function optionalColumn(schema: string, table: string, name: string) {
	return columns(schema, table).has(name) ? name : `NULL AS ${name}`;
}

const requiredTargetTables = [
	'extensions',
	'snapshots',
	'vscode_snapshots',
	'extension_tags',
	'version_events'
];
const targetTables = new Set(
	(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
		(row) => row.name
	)
);
for (const table of requiredTargetTables) {
	if (!targetTables.has(table)) throw new Error(`Migrated target is missing table: ${table}`);
	const count = db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
	if (count.count !== 0) throw new Error(`Target table ${table} is not empty`);
}

sourcePaths.forEach((path, index) => {
	db.exec(`ATTACH DATABASE ${quote(`file:${path}?mode=ro`)} AS source${index}`);
});

db.exec(`
	CREATE TEMP TABLE extension_candidates (
		source_rank INTEGER NOT NULL,
		source_id INTEGER NOT NULL,
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		display_name TEXT NOT NULL,
		pinned INTEGER NOT NULL,
		vscode_id TEXT,
		vscode_checked_at TEXT,
		icon_url TEXT,
		description TEXT,
		repo_url TEXT,
		homepage_url TEXT,
		bugs_url TEXT
	);
	CREATE INDEX temp.idx_extension_candidates_key
		ON extension_candidates(namespace, name, source_rank);

	CREATE TEMP TABLE snapshot_candidates (
		source_rank INTEGER NOT NULL,
		source_id INTEGER NOT NULL,
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		date TEXT NOT NULL,
		scraped_at TEXT NOT NULL,
		download_count INTEGER NOT NULL,
		version TEXT NOT NULL
	);
	CREATE INDEX temp.idx_snapshot_candidates_key
		ON snapshot_candidates(namespace, name, date);

	CREATE TEMP TABLE vscode_candidates (
		source_rank INTEGER NOT NULL,
		source_id INTEGER NOT NULL,
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		date TEXT NOT NULL,
		scraped_at TEXT NOT NULL,
		install_count INTEGER NOT NULL
	);
	CREATE INDEX temp.idx_vscode_candidates_key
		ON vscode_candidates(namespace, name, date);

	CREATE TEMP TABLE tag_candidates (
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		tag TEXT NOT NULL
	);
`);

for (let sourceRank = 0; sourceRank < sourcePaths.length; sourceRank++) {
	const schema = `source${sourceRank}`;
	const extensionColumns = columns(schema, 'extensions');
	for (const required of ['id', 'namespace', 'name', 'display_name', 'pinned']) {
		if (!extensionColumns.has(required)) {
			throw new Error(`${sourcePaths[sourceRank]} is missing extensions.${required}`);
		}
	}

	db.exec(`
		INSERT INTO extension_candidates
		SELECT
			${sourceRank},
			id,
			namespace,
			name,
			display_name,
			pinned,
			${optionalColumn(schema, 'extensions', 'vscode_id')},
			${optionalColumn(schema, 'extensions', 'vscode_checked_at')},
			${optionalColumn(schema, 'extensions', 'icon_url')},
			${optionalColumn(schema, 'extensions', 'description')},
			${optionalColumn(schema, 'extensions', 'repo_url')},
			${optionalColumn(schema, 'extensions', 'homepage_url')},
			${optionalColumn(schema, 'extensions', 'bugs_url')}
		FROM ${schema}.extensions;

		INSERT INTO snapshot_candidates
		SELECT
			${sourceRank},
			s.id,
			e.namespace,
			e.name,
			s.date,
			s.scraped_at,
			s.download_count,
			s.version
		FROM ${schema}.snapshots s
		JOIN ${schema}.extensions e ON e.id = s.extension_id;

		INSERT INTO vscode_candidates
		SELECT
			${sourceRank},
			s.id,
			e.namespace,
			e.name,
			s.date,
			s.scraped_at,
			s.install_count
		FROM ${schema}.vscode_snapshots s
		JOIN ${schema}.extensions e ON e.id = s.extension_id;

		INSERT INTO tag_candidates
		SELECT e.namespace, e.name, t.tag
		FROM ${schema}.extension_tags t
		JOIN ${schema}.extensions e ON e.id = t.extension_id
		WHERE trim(t.tag) <> '';
	`);
}

db.exec('BEGIN IMMEDIATE');
try {
	db.exec(`
		WITH ranked AS (
			SELECT *,
				row_number() OVER (
					PARTITION BY namespace, name
					ORDER BY source_rank DESC, source_id DESC
				) AS rn
			FROM extension_candidates
		)
		INSERT INTO extensions (
			namespace, name, display_name, pinned, vscode_id, vscode_checked_at,
			icon_url, description, repo_url, homepage_url, bugs_url
		)
		SELECT
			namespace, name, display_name, pinned, vscode_id, vscode_checked_at,
			icon_url, description, repo_url, homepage_url, bugs_url
		FROM ranked
		WHERE rn = 1;

		UPDATE extensions
		SET pinned = (
			SELECT max(c.pinned)
			FROM extension_candidates c
			WHERE c.namespace = extensions.namespace AND c.name = extensions.name
		);
	`);

	for (const column of [
		'vscode_id',
		'vscode_checked_at',
		'icon_url',
		'description',
		'repo_url',
		'homepage_url',
		'bugs_url'
	]) {
		db.exec(`
			UPDATE extensions
			SET ${column} = (
				SELECT c.${column}
				FROM extension_candidates c
				WHERE c.namespace = extensions.namespace
					AND c.name = extensions.name
					AND c.${column} IS NOT NULL
					AND trim(c.${column}) <> ''
				ORDER BY c.source_rank DESC, c.source_id DESC
				LIMIT 1
			)
			WHERE EXISTS (
				SELECT 1
				FROM extension_candidates c
				WHERE c.namespace = extensions.namespace
					AND c.name = extensions.name
					AND c.${column} IS NOT NULL
					AND trim(c.${column}) <> ''
			);
		`);
	}

	db.exec(`
		WITH ranked AS (
			SELECT *,
				row_number() OVER (
					PARTITION BY namespace, name, date
					ORDER BY scraped_at DESC, download_count DESC, source_rank DESC, source_id DESC
				) AS rn
			FROM snapshot_candidates
		)
		INSERT INTO snapshots (extension_id, date, scraped_at, download_count, version)
		SELECT e.id, r.date, r.scraped_at, r.download_count, r.version
		FROM ranked r
		JOIN extensions e ON e.namespace = r.namespace AND e.name = r.name
		WHERE r.rn = 1;

		WITH ranked AS (
			SELECT *,
				row_number() OVER (
					PARTITION BY namespace, name, date
					ORDER BY scraped_at DESC, install_count DESC, source_rank DESC, source_id DESC
				) AS rn
			FROM vscode_candidates
		)
		INSERT INTO vscode_snapshots (extension_id, date, scraped_at, install_count)
		SELECT e.id, r.date, r.scraped_at, r.install_count
		FROM ranked r
		JOIN extensions e ON e.namespace = r.namespace AND e.name = r.name
		WHERE r.rn = 1;

		INSERT INTO extension_tags (extension_id, tag)
		SELECT DISTINCT e.id, c.tag
		FROM tag_candidates c
		JOIN extensions e ON e.namespace = c.namespace AND e.name = c.name;

		WITH history AS (
			SELECT
				extension_id,
				date,
				scraped_at,
				version,
				lag(version) OVER (PARTITION BY extension_id ORDER BY date) AS old_version
			FROM snapshots
		)
		INSERT INTO version_events (
			extension_id, date, detected_at, old_version, new_version
		)
		SELECT extension_id, date, scraped_at, old_version, version
		FROM history
		WHERE old_version IS NOT NULL AND old_version <> version;
	`);

	db.exec('COMMIT');
} catch (error) {
	db.exec('ROLLBACK');
	throw error;
}

const summary = db
	.prepare(`
		SELECT
			(SELECT count(*) FROM extensions) AS extensions,
			(SELECT count(*) FROM snapshots) AS snapshots,
			(SELECT count(DISTINCT date) FROM snapshots) AS snapshotDays,
			(SELECT min(date) FROM snapshots) AS firstDate,
			(SELECT max(date) FROM snapshots) AS lastDate,
			(SELECT count(*) FROM vscode_snapshots) AS vscodeSnapshots,
			(SELECT count(*) FROM extension_tags) AS tags,
			(SELECT count(*) FROM version_events) AS versionEvents
	`)
	.get();

console.log('[merge-local] Complete', summary);
db.close();
