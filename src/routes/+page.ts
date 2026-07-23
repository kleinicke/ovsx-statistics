import type { PageLoad } from './$types';
import type { LatestJson } from '$lib/types.js';

const emptyLatest: LatestJson = {
	rows: [],
	movers: [],
	totalCount: 0,
	latestDate: null,
	generatedAt: null
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/latest.json');
		if (!res.ok) return emptyLatest;
		const data = (await res.json()) as Partial<LatestJson>;
		return { ...emptyLatest, ...data };
	} catch {
		return emptyLatest;
	}
};
