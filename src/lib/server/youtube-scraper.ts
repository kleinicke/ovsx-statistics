import { db } from './db/index.js';
import { extensions, extensionTags, snapshots } from './db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { fetchJson } from './http.js';
import { YOUTUBE_NAMESPACE } from '../utils.js';

// Searchable on the leaderboard: the search box also matches tags
const AUTHOR_TAG = 'Martha Nick';

// YouTube video IDs to track. Stored as pseudo-extensions in the `youtube`
// namespace; the view count is saved as the snapshot's download count.
const YOUTUBE_VIDEOS = ['vpZxZDDmm64'];

interface VideoStats {
	title: string;
	views: number;
}

const decodeEntities = (s: string) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

// Official Data API — preferred when YOUTUBE_API_KEY is set (robust on CI runners).
async function fetchViaApi(videoId: string, apiKey: string): Promise<VideoStats> {
	const data = await fetchJson<{
		items?: { snippet?: { title?: string }; statistics?: { viewCount?: string } }[];
	}>(
		`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`
	);
	const item = data.items?.[0];
	if (!item?.statistics?.viewCount) throw new Error('video not found or views hidden');
	return { title: item.snippet?.title ?? videoId, views: Number(item.statistics.viewCount) };
}

// Fallback without a key: read the view count embedded in the public watch page.
async function fetchViaWatchPage(videoId: string): Promise<VideoStats> {
	const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (compatible; vscode-extension-tracker/1.0)',
			'Accept-Language': 'en-US,en;q=0.9',
			// Skip the EU consent interstitial
			Cookie: 'SOCS=CAI; CONSENT=YES+1'
		}
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for watch page`);
	const html = await res.text();

	const views = html.match(/"videoDetails":\{[\s\S]*?"viewCount":"(\d+)"/)?.[1];
	if (!views) throw new Error('no view count in watch page (consent or bot-check page?)');
	const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
	return { title: title ? decodeEntities(title) : videoId, views: Number(views) };
}

export async function scrapeYoutubeViews(): Promise<{ scraped: number; errors: string[] }> {
	const apiKey = process.env.YOUTUBE_API_KEY;
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const scrapedAt = now.toISOString();
	const errors: string[] = [];
	let scraped = 0;

	for (const videoId of YOUTUBE_VIDEOS) {
		try {
			const stats = apiKey
				? await fetchViaApi(videoId, apiKey)
				: await fetchViaWatchPage(videoId);

			const meta = {
				displayName: stats.title,
				iconUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
				repoUrl: `https://www.youtube.com/watch?v=${videoId}`,
				pinned: true
			};
			await db
				.insert(extensions)
				.values({ namespace: YOUTUBE_NAMESPACE, name: videoId, ...meta })
				.onConflictDoUpdate({ target: [extensions.namespace, extensions.name], set: meta });
			const ext = await db
				.select({ id: extensions.id })
				.from(extensions)
				.where(and(eq(extensions.namespace, YOUTUBE_NAMESPACE), eq(extensions.name, videoId)))
				.get();

			await db
				.insert(extensionTags)
				.values({ extensionId: ext!.id, tag: AUTHOR_TAG })
				.onConflictDoNothing();

			await db
				.insert(snapshots)
				.values({ extensionId: ext!.id, date, scrapedAt, downloadCount: stats.views, version: '1' })
				.onConflictDoUpdate({
					target: [snapshots.extensionId, snapshots.date],
					set: { downloadCount: sql`excluded.download_count`, scrapedAt: sql`excluded.scraped_at` }
				});
			scraped++;
		} catch (e) {
			// Never include the request URL here: it contains the API key
			errors.push(`${videoId}: ${e instanceof Error ? e.message.replace(/key=[^&\s]+/g, 'key=***') : e}`);
		}
	}

	console.log(`[youtube-scraper] Scraped ${scraped} videos. Errors: ${errors.length}`);
	return { scraped, errors };
}
