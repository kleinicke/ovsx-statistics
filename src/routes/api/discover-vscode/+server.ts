import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { extensions, snapshots } from '$lib/server/db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { discoverVscodeIds } from '$lib/server/vscode-scraper.js';

let running = false;

export const POST: RequestHandler = async () => {
	if (running) return json({ error: 'Discovery already in progress' }, { status: 409 });
	running = true;

	try {
		const latestDate = await db
			.select({ date: snapshots.date })
			.from(snapshots)
			.orderBy(desc(snapshots.date))
			.limit(1)
			.get();

		if (!latestDate) return json({ error: 'No snapshots yet' }, { status: 400 });

		const top100 = await db
			.select({ id: extensions.id })
			.from(snapshots)
			.innerJoin(extensions, eq(snapshots.extensionId, extensions.id))
			.where(eq(snapshots.date, latestDate.date))
			.orderBy(desc(snapshots.downloadCount))
			.limit(100)
			.all();

		const pinned = await db
			.select({ id: extensions.id })
			.from(extensions)
			.where(eq(extensions.pinned, true))
			.all();

		const allIds = [...new Set([...top100.map((e) => e.id), ...pinned.map((e) => e.id)])];
		const result = await discoverVscodeIds(allIds);
		return json(result);
	} finally {
		running = false;
	}
};
