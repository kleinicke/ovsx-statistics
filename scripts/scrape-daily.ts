import 'dotenv/config';
import { runScrape } from '../src/lib/server/scraper.js';
import { scrapeVscodeInstalls } from '../src/lib/server/vscode-scraper.js';

const openVsx = await runScrape();
console.log(`[scrape-daily] Open VSX scraped=${openVsx.scraped} errors=${openVsx.errors.length}`);

const vsCode = await scrapeVscodeInstalls();
console.log(`[scrape-daily] VS Code scraped=${vsCode.scraped} errors=${vsCode.errors.length}`);

await import('./export-latest.js');
