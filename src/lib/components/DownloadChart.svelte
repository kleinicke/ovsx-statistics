<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Tooltip,
		Filler,
		CategoryScale,
		Legend,
		type ChartDataset
	} from 'chart.js';
	import { formatNumber } from '$lib/utils.js';

	Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler, CategoryScale, Legend);

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

	let {
		history,
		vsCodeHistory = []
	}: { history: OpenVsxPoint[]; vsCodeHistory?: VsCodePoint[] } = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	function buildChart() {
		if (chart) chart.destroy();

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? 'oklch(64% 0.02 264)' : 'oklch(45% 0.02 264)';
		const gridColor = isDark ? 'oklch(20% 0.01 264)' : 'oklch(90% 0.005 264)';
		const openVsxColor = isDark ? 'oklch(70% 0.15 240)' : 'oklch(50% 0.2 240)'; // blue
		const vsCodeColor  = isDark ? 'oklch(75% 0.15 75)'  : 'oklch(60% 0.18 75)';  // amber

		// Build a unified date axis from all available dates
		const allDates = [...new Set([
			...history.map((h) => h.date),
			...vsCodeHistory.map((v) => v.date)
		])].sort();

		// Map VS Code data by date for O(1) lookup
		const vsCodeByDate = new Map(vsCodeHistory.map((v) => [v.date, v]));

		const hasVsCode = vsCodeHistory.length > 0;
		const showLegend = hasVsCode;
		const pointRadius = allDates.length > 60 ? 0 : 3;

		type DS = ChartDataset<'line', (number | null)[]>;
		const datasets: DS[] = [
			{
				label: 'Open VSX downloads',
				data: allDates.map((d) => {
					const p = history.find((h) => h.date === d);
					return p ? p.downloadCount : null;
				}),
				borderColor: openVsxColor,
				backgroundColor: openVsxColor + '20',
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
				label: 'VS Code installs',
				data: allDates.map((d) => vsCodeByDate.get(d)?.installCount ?? null),
				borderColor: vsCodeColor,
				backgroundColor: vsCodeColor + '20',
				fill: false,
				tension: 0.3,
				pointRadius,
				pointHoverRadius: 5,
				yAxisID: 'yRight',
				spanGaps: false
			});
		}

		chart = new Chart(canvas, {
			type: 'line',
			data: { labels: allDates, datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: {
						display: showLegend,
						labels: { color: textColor, boxWidth: 12, padding: 16 }
					},
					tooltip: {
						callbacks: {
							label: (ctx) => {
								const val = ctx.parsed.y;
								if (val === null) return '';
								const unit = ctx.dataset.label?.includes('VS Code') ? 'installs' : 'downloads';
								return ` ${ctx.dataset.label}: ${val.toLocaleString('en-US')} ${unit}`;
							},
							afterBody: (items) => {
								const idx = items[0]?.dataIndex;
								const point = history.find((h) => h.date === allDates[idx]);
								if (!point) return [];
								return [` v${point.version}  ·  ${point.scrapedAt.slice(0, 16).replace('T', ' ')} UTC`];
							}
						}
					}
				},
				scales: {
					x: {
						ticks: { color: textColor, maxTicksLimit: 10 },
						grid: { color: gridColor }
					},
					yLeft: {
						type: 'linear',
						position: 'left',
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
							ticks: {
								color: vsCodeColor,
								callback: (v) => (typeof v === 'number' ? formatNumber(v) : String(v))
							},
							grid: { drawOnChartArea: false }
						}
					})
				}
			}
		});
	}

	onMount(() => {
		buildChart();
		const observer = new MutationObserver(() => buildChart());
		observer.observe(document.documentElement, { attributeFilter: ['class'] });
		onDestroy(() => observer.disconnect());
	});

	onDestroy(() => chart?.destroy());
</script>

<div class="relative h-72">
	<canvas bind:this={canvas}></canvas>
</div>
