import type { PageLoad } from './$types';
import type { LatestJson } from '$lib/types.js';

const emptyLatest: LatestJson = {
	rows: [],
	latestDate: null,
	generatedAt: null
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/latest.json');
		if (!res.ok) return emptyLatest;
		return (await res.json()) as LatestJson;
	} catch {
		return emptyLatest;
	}
};
