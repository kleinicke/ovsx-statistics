export interface LeaderboardRow {
	rank: number;
	id: number;
	namespace: string;
	name: string;
	displayName: string;
	downloadCount: number;
	version: string;
	// Optional fields are omitted from latest-all.json rows to keep the payload small
	pinned?: boolean;
	delta?: number | null; // downloads gained since previous snapshot (~24h)
	delta7?: number | null; // downloads gained over the last ~7 days
	rankDelta?: number | null; // positions gained since previous snapshot (positive = climbed)
	iconUrl?: string | null;
	tags?: string[];
	sparkline?: (number | null)[]; // daily new downloads, oldest → newest, null = no data
}

// static/latest.json — loaded eagerly by the index page (top rows + pinned)
export interface LatestJson {
	rows: LeaderboardRow[];
	movers: LeaderboardRow[];
	totalCount: number;
	latestDate: string | null;
	generatedAt: string | null;
}

// static/latest-all.json — lazily fetched when the user searches beyond the top rows
export interface LatestAllJson {
	rows: LeaderboardRow[];
	latestDate: string | null;
	generatedAt: string | null;
}

export interface ExtensionRecord {
	id: number;
	namespace: string;
	name: string;
	displayName: string;
	pinned: boolean;
	vsCodeId: string | null;
	iconUrl: string | null;
	description: string | null;
	repoUrl: string | null;
	homepageUrl: string | null;
	bugsUrl: string | null;
}

export interface OpenVsxSnapshot {
	date: string;
	scrapedAt: string;
	downloadCount: number;
	version: string;
}

export interface VsCodeSnapshot {
	date: string;
	scrapedAt: string;
	installCount: number;
}

export interface VersionEvent {
	id: number;
	date: string;
	detectedAt: string;
	oldVersion: string;
	newVersion: string;
}

export interface ExtensionDetailJson {
	ext: ExtensionRecord;
	history: OpenVsxSnapshot[];
	vsCodeHistory: VsCodeSnapshot[];
	releases: VersionEvent[];
	latest: OpenVsxSnapshot | null;
	latestVsCode: VsCodeSnapshot | null;
	tags: string[];
	iconUrl: string | null;
	description: string | null;
	repoUrl: string | null;
	homepageUrl: string | null;
	bugsUrl: string | null;
}
