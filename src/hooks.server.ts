import cron from 'node-cron';
import { runScrape } from '$lib/server/scraper.js';
import { scrapeVscodeInstalls } from '$lib/server/vscode-scraper.js';

// Run daily at 02:00 UTC
cron.schedule('0 2 * * *', async () => {
	try {
		await runScrape();
	} catch (e) {
		console.error('[cron] Open VSX scrape failed:', e);
	}
	try {
		await scrapeVscodeInstalls();
	} catch (e) {
		console.error('[cron] VS Code scrape failed:', e);
	}
});

// Run once on startup so the DB has data immediately
runScrape().catch((e) => console.error('[startup] Initial scrape failed:', e));

export {};
