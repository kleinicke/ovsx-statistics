import 'dotenv/config';
import { appendFile } from 'node:fs/promises';
import { runScrape } from '../src/lib/server/scraper.js';
import { discoverVscodeIds, scrapeVscodeInstalls } from '../src/lib/server/vscode-scraper.js';

const MAX_ERROR_RATE = 0.05;
const summary: string[] = [];
let failed = false;

function logErrors(source: string, errors: string[]) {
	for (const err of errors.slice(0, 20)) console.error(`[scrape-daily] ${source}: ${err}`);
	if (errors.length > 20) console.error(`[scrape-daily] ${source}: …and ${errors.length - 20} more`);
}

// Open VSX is the primary dataset — a thrown error here fails the job before
// anything is exported, keeping the previous day's data intact.
const openVsx = await runScrape();
console.log(`[scrape-daily] Open VSX scraped=${openVsx.scraped} errors=${openVsx.errors.length}`);
logErrors('open-vsx', openVsx.errors);
summary.push(`- Open VSX: **${openVsx.scraped}** scraped, ${openVsx.errors.length} errors`);

const attempted = openVsx.scraped + openVsx.errors.length;
if (openVsx.scraped === 0 || openVsx.errors.length > attempted * MAX_ERROR_RATE) {
	failed = true;
	summary.push('  - ❌ Open VSX error budget exceeded');
}

// VS Code Marketplace data is secondary: log failures and mark the job red,
// but keep going so the Open VSX export still lands.
try {
	const discovery = await discoverVscodeIds();
	summary.push(`- VS Code discovery: **${discovery.discovered}** new of ${discovery.checked} checked`);
} catch (e) {
	failed = true;
	console.error(`[scrape-daily] VS Code discovery failed: ${e}`);
	summary.push(`- ❌ VS Code discovery failed: ${e}`);
}

try {
	const vsCode = await scrapeVscodeInstalls();
	console.log(`[scrape-daily] VS Code scraped=${vsCode.scraped} errors=${vsCode.errors.length}`);
	logErrors('vscode', vsCode.errors);
	summary.push(`- VS Code installs: **${vsCode.scraped}** scraped, ${vsCode.errors.length} errors`);
} catch (e) {
	failed = true;
	console.error(`[scrape-daily] VS Code scrape failed: ${e}`);
	summary.push(`- ❌ VS Code scrape failed: ${e}`);
}

if (openVsx.scraped > 0) {
	await import('./export-latest.js');
	summary.push('- Exported latest.json + latest-all.json');
}

if (process.env.GITHUB_STEP_SUMMARY) {
	await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Daily scrape\n\n${summary.join('\n')}\n`);
}

if (failed) process.exit(1);
