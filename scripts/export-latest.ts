import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getLatestRanking } from '../src/lib/server/latest.js';

const outputPath = resolve(process.argv[2] ?? 'static/latest.json');
const latest = await getLatestRanking();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}.tmp`, `${JSON.stringify(latest)}\n`);
await rename(`${outputPath}.tmp`, outputPath);

console.log(`[export-latest] Wrote ${latest.rows.length} rows to ${outputPath}`);
