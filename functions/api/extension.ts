import worker from '../../worker/index.js';

export const onRequest: PagesFunction<Env> = async (context) => {
	const cache = caches.default;
	const cached = await cache.match(context.request);
	if (cached) return cached;

	const response = await worker.fetch(context.request, context.env);

	if (context.request.method === 'GET' && response.ok) {
		context.waitUntil(cache.put(context.request, response.clone()));
	}

	return response;
};
