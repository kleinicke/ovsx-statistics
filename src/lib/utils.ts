import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

export function formatNumberFull(n: number): string {
	return n.toLocaleString('en-US');
}

// Non-extension sources are tracked as pseudo-extensions: namespace = source,
// name = the source's own ID. They are ranked after all Open VSX extensions.
export const EXTERNAL_SOURCES: Record<string, { label: string; unit: string; url: (id: string) => string }> = {
	zenodo: { label: 'Zenodo', unit: 'unique downloads', url: (id) => `https://zenodo.org/records/${id}` },
	youtube: { label: 'YouTube', unit: 'views', url: (id) => `https://www.youtube.com/watch?v=${id}` }
};

export const ZENODO_NAMESPACE = 'zenodo';
export const YOUTUBE_NAMESPACE = 'youtube';

// Display labels for source_metrics keys, in display order
export const METRIC_LABELS: Record<string, { label: string }> = {
	unique_downloads: { label: 'Unique downloads' },
	downloads: { label: 'Total downloads' },
	unique_views: { label: 'Unique views' },
	views: { label: 'Total views' },
	version_unique_downloads: { label: 'Unique downloads (this version)' },
	version_downloads: { label: 'Total downloads (this version)' },
	version_unique_views: { label: 'Unique views (this version)' },
	version_views: { label: 'Total views (this version)' }
};
