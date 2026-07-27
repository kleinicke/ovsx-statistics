<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		BarController,
		BarElement,
		LinearScale,
		Tooltip,
		Filler,
		CategoryScale,
		Legend,
		type ChartDataset,
		type Plugin
	} from 'chart.js';
	import { formatNumber } from '$lib/utils.js';

	Chart.register(
		LineController,
		LineElement,
		PointElement,
		BarController,
		BarElement,
		LinearScale,
		Tooltip,
		Filler,
		CategoryScale,
		Legend
	);

	interface OpenVsxPoint {
		date: string;
		scrapedAt: string;
		downloadCount: number;
		version: string;
	}

	interface VsCodePoint {
		date: string;
		scrapedAt: string;
		installCount: number;
	}

	interface ReleaseEvent {
		date: string;
		newVersion: string;
		oldVersion: string;
	}

	let {
		history,
		vsCodeHistory = [],
		releases = []
	}: {
		history: OpenVsxPoint[];
		vsCodeHistory?: VsCodePoint[];
		releases?: ReleaseEvent[];
	} = $props();

	type Metric = 'cumulative' | 'new';
	type Granularity = 'day' | 'week' | 'month';

	let metric = $state<Metric>('cumulative');
	let granularity = $state<Granularity>('day');
	let showReleases = $state(true);
	let themeVersion = $state(0);

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	// Collapse a YYYY-MM-DD date onto the start of its day/week/month bucket.
	function bucketKey(date: string, g: Granularity): string {
		if (g === 'day') return date;
		if (g === 'month') return `${date.slice(0, 7)}-01`;
		// Week → the Monday of that ISO week
		const d = new Date(`${date}T00:00:00Z`);
		const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
		d.setUTCDate(d.getUTCDate() - dow);
		return d.toISOString().slice(0, 10);
	}

	// Human-friendly axis label for a bucket key.
	function bucketLabel(key: string, g: Granularity): string {
		if (g === 'month') return key.slice(0, 7);
		return key;
	}

	// Reduce cumulative points to one value per bucket (the latest reading in the
	// bucket), then optionally convert to per-bucket "new" counts.
	function toBuckets(
		points: { date: string; value: number }[],
		g: Granularity,
		m: Metric
	): Map<string, number | null> {
		const latestInBucket = new Map<string, { date: string; value: number }>();
		for (const p of points) {
			const k = bucketKey(p.date, g);
			const cur = latestInBucket.get(k);
			if (!cur || p.date > cur.date) latestInBucket.set(k, p);
		}

		const ordered = [...latestInBucket.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
		const out = new Map<string, number | null>();
		if (m === 'cumulative') {
			for (const [k, p] of ordered) out.set(k, p.value);
		} else {
			// New downloads in a bucket = cumulative at end of bucket minus the
			// cumulative at the end of the previous bucket. First bucket has no
			// baseline, so it stays null.
			let prev: number | null = null;
			for (const [k, p] of ordered) {
				out.set(k, prev === null ? null : p.value - prev);
				prev = p.value;
			}
		}
		return out;
	}

	// Draws dashed vertical lines at buckets where a new version was released.
	const versionLinesPlugin: Plugin = {
		id: 'versionLines',
		afterDatasetsDraw(c, _args, opts) {
			const lines = (opts as { lines?: number[]; color?: string }).lines;
			const color = (opts as { color?: string }).color ?? 'rgba(16,185,129,0.9)';
			if (!lines?.length) return;
			const { ctx, chartArea, scales } = c;
			const xScale = scales.x;
			ctx.save();
			ctx.lineWidth = 1;
			ctx.strokeStyle = color;
			ctx.setLineDash([4, 3]);
			for (const idx of lines) {
				const px = xScale.getPixelForValue(idx);
				if (px == null || px < chartArea.left - 0.5 || px > chartArea.right + 0.5) continue;
				ctx.beginPath();
				ctx.moveTo(px, chartArea.top);
				ctx.lineTo(px, chartArea.bottom);
				ctx.stroke();
			}
			ctx.restore();
		}
	};

	function buildChart() {
		if (chart) chart.destroy();

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? 'oklch(64% 0.02 264)' : 'oklch(45% 0.02 264)';
		const gridColor = isDark ? 'oklch(20% 0.01 264)' : 'oklch(90% 0.005 264)';
		const openVsxColor = isDark ? 'oklch(70% 0.15 240)' : 'oklch(50% 0.2 240)'; // blue
		const vsCodeColor = isDark ? 'oklch(75% 0.15 75)' : 'oklch(60% 0.18 75)'; // amber
		const releaseColor = isDark ? 'oklch(72% 0.15 155)' : 'oklch(58% 0.16 155)'; // green

		const openVsxBuckets = toBuckets(
			history.map((h) => ({ date: h.date, value: h.downloadCount })),
			granularity,
			metric
		);
		const vsCodeBuckets = toBuckets(
			vsCodeHistory.map((v) => ({ date: v.date, value: v.installCount })),
			granularity,
			metric
		);

		// Unified, sorted bucket axis across both series.
		const keys = [...new Set([...openVsxBuckets.keys(), ...vsCodeBuckets.keys()])].sort();
		const labels = keys.map((k) => bucketLabel(k, granularity));

		// version (of the latest reading) per bucket, for the tooltip
		const versionByBucket = new Map<string, string>();
		{
			const latest = new Map<string, { date: string; version: string }>();
			for (const h of history) {
				const k = bucketKey(h.date, granularity);
				const cur = latest.get(k);
				if (!cur || h.date > cur.date) latest.set(k, { date: h.date, version: h.version });
			}
			for (const [k, v] of latest) versionByBucket.set(k, v.version);
		}

		// releases grouped by bucket → for both the vertical lines and the tooltip
		const releasesByBucket = new Map<string, string[]>();
		for (const r of releases) {
			const k = bucketKey(r.date, granularity);
			const list = releasesByBucket.get(k) ?? [];
			list.push(r.newVersion);
			releasesByBucket.set(k, list);
		}
		const releaseLineIndexes = showReleases
			? keys.map((k, i) => (releasesByBucket.has(k) ? i : -1)).filter((i) => i >= 0)
			: [];

		const hasVsCode = vsCodeBuckets.size > 0;
		const isBar = metric === 'new';
		const pointRadius = labels.length > 60 ? 0 : 3;

		type DS = ChartDataset<'line' | 'bar', (number | null)[]>;
		const datasets: DS[] = [
			{
				type: isBar ? 'bar' : 'line',
				label: metric === 'new' ? 'Open VSX new downloads' : 'Open VSX downloads',
				data: keys.map((k) => openVsxBuckets.get(k) ?? null),
				borderColor: openVsxColor,
				backgroundColor: isBar ? openVsxColor : openVsxColor + '20',
				fill: false,
				tension: 0.3,
				pointRadius,
				pointHoverRadius: 5,
				yAxisID: 'yLeft',
				spanGaps: false
			}
		];

		if (hasVsCode) {
			datasets.push({
				type: isBar ? 'bar' : 'line',
				label: metric === 'new' ? 'VS Code new installs' : 'VS Code installs',
				data: keys.map((k) => vsCodeBuckets.get(k) ?? null),
				borderColor: vsCodeColor,
				backgroundColor: isBar ? vsCodeColor : vsCodeColor + '20',
				fill: false,
				tension: 0.3,
				pointRadius,
				pointHoverRadius: 5,
				yAxisID: 'yRight',
				spanGaps: false
			});
		}

		chart = new Chart(canvas, {
			type: isBar ? 'bar' : 'line',
			data: { labels, datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: {
						display: hasVsCode,
						labels: { color: textColor, boxWidth: 12, padding: 16 }
					},
					tooltip: {
						callbacks: {
							label: (ctx) => {
								const val = ctx.parsed.y;
								if (val === null) return '';
								const isVsCode = ctx.dataset.label?.includes('VS Code');
								const unit = isVsCode ? 'installs' : 'downloads';
								const prefix = metric === 'new' && val >= 0 ? '+' : '';
								return ` ${ctx.dataset.label}: ${prefix}${val.toLocaleString('en-US')} ${unit}`;
							},
							afterBody: (items) => {
								const idx = items[0]?.dataIndex;
								if (idx === undefined) return [];
								const key = keys[idx];
								const out: string[] = [];
								const version = versionByBucket.get(key);
								if (version) out.push(` v${version}`);
								const rel = showReleases ? releasesByBucket.get(key) : undefined;
								if (rel && rel.length > 0) {
									out.push(` ⬤ Released ${rel.map((v) => `v${v}`).join(', ')}`);
								}
								return out;
							}
						}
					},
					// consumed by versionLinesPlugin
					// @ts-expect-error custom plugin options
					versionLines: { lines: releaseLineIndexes, color: releaseColor }
				},
				scales: {
					x: {
						stacked: false,
						ticks: { color: textColor, maxTicksLimit: 10 },
						grid: { color: gridColor }
					},
					yLeft: {
						type: 'linear',
						position: 'left',
						beginAtZero: metric === 'new',
						ticks: {
							color: openVsxColor,
							callback: (v) => (typeof v === 'number' ? formatNumber(v) : String(v))
						},
						grid: { color: gridColor }
					},
					...(hasVsCode && {
						yRight: {
							type: 'linear',
							position: 'right',
							beginAtZero: metric === 'new',
							ticks: {
								color: vsCodeColor,
								callback: (v) => (typeof v === 'number' ? formatNumber(v) : String(v))
							},
							grid: { drawOnChartArea: false }
						}
					})
				}
			},
			plugins: [versionLinesPlugin]
		});
	}

	// Rebuild whenever a control, the data, or the theme changes.
	$effect(() => {
		// touch reactive deps so the effect re-runs
		void metric;
		void granularity;
		void showReleases;
		void themeVersion;
		void history;
		void vsCodeHistory;
		void releases;
		buildChart();
	});

	onMount(() => {
		const observer = new MutationObserver(() => (themeVersion += 1));
		observer.observe(document.documentElement, { attributeFilter: ['class'] });
		onDestroy(() => observer.disconnect());
	});

	onDestroy(() => chart?.destroy());

	const hasReleases = $derived(releases.length > 0);
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
		<!-- Metric -->
		<div class="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden">
			<button
				type="button"
				class="px-3 py-1.5 transition-colors {metric === 'cumulative'
					? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
					: 'hover:bg-[var(--color-accent)]'}"
				onclick={() => (metric = 'cumulative')}
			>
				Total
			</button>
			<button
				type="button"
				class="px-3 py-1.5 border-l border-[var(--color-border)] transition-colors {metric === 'new'
					? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
					: 'hover:bg-[var(--color-accent)]'}"
				onclick={() => (metric = 'new')}
			>
				New
			</button>
		</div>

		<!-- Granularity -->
		<div class="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden">
			{#each [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']] as [value, text] (value)}
				<button
					type="button"
					class="px-3 py-1.5 transition-colors {granularity === value
						? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
						: 'hover:bg-[var(--color-accent)]'} {value !== 'day'
						? 'border-l border-[var(--color-border)]'
						: ''}"
					onclick={() => (granularity = value as Granularity)}
				>
					{text}
				</button>
			{/each}
		</div>

		<!-- Version releases -->
		{#if hasReleases}
			<label class="inline-flex items-center gap-2 cursor-pointer select-none">
				<input type="checkbox" bind:checked={showReleases} class="accent-[var(--color-emerald)]" />
				<span>Show version releases</span>
			</label>
		{/if}
	</div>

	<div class="relative h-72">
		<canvas bind:this={canvas}></canvas>
	</div>
</div>
