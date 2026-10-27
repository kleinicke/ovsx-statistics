import { sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { sourceMetrics } from './db/schema.js';

// Upsert one row per metric for today, so a same-day rerun updates in place.
export async function saveMetrics(
	extensionId: number,
	date: string,
	values: Record<string, number>
): Promise<void> {
	const rows = Object.entries(values).map(([metric, value]) => ({ extensionId, date, metric, value }));
	if (rows.length === 0) return;
	await db
		.insert(sourceMetrics)
		.values(rows)
		.onConflictDoUpdate({
			target: [sourceMetrics.extensionId, sourceMetrics.date, sourceMetrics.metric],
			set: { value: sql`excluded.value` }
		});
}
