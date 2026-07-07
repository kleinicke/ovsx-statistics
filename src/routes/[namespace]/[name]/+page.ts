import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { ExtensionDetailJson } from '$lib/types.js';

export const prerender = false;

export const load: PageLoad = async ({ fetch, params }) => {
	const url = new URL('/api/extension', globalThis.location?.origin ?? 'http://localhost');
	url.searchParams.set('namespace', params.namespace);
	url.searchParams.set('name', params.name);

	const res = await fetch(`${url.pathname}${url.search}`);
	if (res.status === 404) error(404, 'Extension not found');
	if (!res.ok) error(502, 'Extension history is unavailable');

	return (await res.json()) as ExtensionDetailJson;
};
