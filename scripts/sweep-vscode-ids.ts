import 'dotenv/config';
import { discoverVscodeIds, scrapeVscodeInstalls } from '../src/lib/server/vscode-scraper.js';

// One-off: re-check every extension that still lacks a vscode_id against the VS
// Code Marketplace (ignoring the usual 30-day recheck gate), then immediately
// capture install counts for everything that matched. Batched at 100 IDs per
// request with retry/backoff, so the full ~10k catalogue is ~106 requests.
console.log('[sweep] Forcing full VS Code ID discovery…');
const discovery = await discoverVscodeIds({ force: true });
console.log(`[sweep] Matched ${discovery.discovered} new of ${discovery.checked} checked`);

console.log('[sweep] Capturing install counts for all known IDs…');
const installs = await scrapeVscodeInstalls();
console.log(`[sweep] Install snapshots: ${installs.scraped} scraped, ${installs.errors.length} errors`);
for (const err of installs.errors.slice(0, 20)) console.error(`[sweep] ${err}`);
if (installs.errors.length > 20) console.error(`[sweep] …and ${installs.errors.length - 20} more`);

console.log('[sweep] Done.');
