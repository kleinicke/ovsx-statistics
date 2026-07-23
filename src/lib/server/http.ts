const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class HttpError extends Error {
	constructor(
		public readonly status: number,
		url: string
	) {
		super(`HTTP ${status} for ${url}`);
	}
}

function isRetryable(status: number): boolean {
	return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch JSON with exponential backoff on network errors, 429 and 5xx.
// Non-retryable statuses (e.g. 404) throw HttpError immediately.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));

		try {
			const res = await fetch(url, init);
			if (res.ok) return (await res.json()) as T;
			if (!isRetryable(res.status)) throw new HttpError(res.status, url);
			lastError = new HttpError(res.status, url);
		} catch (e) {
			if (e instanceof HttpError && !isRetryable(e.status)) throw e;
			lastError = e;
		}
	}

	throw lastError;
}

export function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	return chunks;
}
