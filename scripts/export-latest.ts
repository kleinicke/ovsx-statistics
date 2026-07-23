import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getLatestExports } from '../src/lib/server/latest.js';

const outDir = resolve(process.argv[2] ?? 'static');
const { latest, all } = await getLatestExports();

// Never clobber a good export with an empty one — fail loudly instead
if (latest.rows.length === 0) {
	console.error('[export-latest] Ranking is empty; refusing to overwrite existing exports');
	process.exit(1);
}

async function writeJson(path: string, data: unknown) {
	await writeFile(`${path}.tmp`, `${JSON.stringify(data)}\n`);
	await rename(`${path}.tmp`, path);
}

await mkdir(outDir, { recursive: true });
await writeJson(`${outDir}/latest.json`, latest);
await writeJson(`${outDir}/latest-all.json`, all);

console.log(
	`[export-latest] Wrote ${latest.rows.length} top rows and ${all.rows.length} total rows to ${outDir}`
);
