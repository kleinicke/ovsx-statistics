export interface LeaderboardRow {
	rank: number;
	id: number;
	namespace: string;
	name: string;
	displayName: string;
	pinned: boolean;
	downloadCount: number;
	version: string;
	delta: number | null;
	tags: string[];
}

export interface LatestJson {
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
