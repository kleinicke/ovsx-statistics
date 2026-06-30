import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { runScrape } from '$lib/server/scraper.js';

let running = false;

export const POST: RequestHandler = async () => {
	if (running) {
		return json({ error: 'Scrape already in progress' }, { status: 409 });
	}
	running = true;
	try {
		const result = await runScrape();
		return json(result);
	} finally {
		running = false;
	}
};
