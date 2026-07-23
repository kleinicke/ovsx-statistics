<script lang="ts">
	import type { PageData } from './$types';
	import type { LatestAllJson, LeaderboardRow } from '$lib/types.js';
	import { formatNumber } from '$lib/utils.js';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { Pin, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Flame } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let search = $state('');
	let tagSearch = $state('');

	// The eager payload only holds the top rows; the full index is fetched
	// once, in the background, the first time the user starts filtering.
	let allRows: LeaderboardRow[] | null = $state(null);
	let allRequested = false;

	async function ensureAllRows() {
		if (allRequested || data.rows.length >= data.totalCount) return;
		allRequested = true;
		try {
			const res = await fetch('/latest-all.json');
			if (!res.ok) return;
			const full = (await res.json()) as LatestAllJson;
			const topById = new Map(data.rows.map((r) => [r.id, r]));
			allRows = full.rows.map((r) => topById.get(r.id) ?? r);
		} catch {
			allRequested = false;
		}
	}

	const isFiltering = $derived(search.trim() !== '' || tagSearch.trim() !== '');
	const source = $derived(isFiltering ? (allRows ?? data.rows) : data.rows);

	const filtered = $derived(
		source.filter((r) => {
			const s = search.toLowerCase();
			const t = tagSearch.toLowerCase().trim();
			const matchesText =
				!s ||
				r.displayName.toLowerCase().includes(s) ||
				`${r.namespace}.${r.name}`.toLowerCase().includes(s);
			const matchesTag = !t || (r.tags ?? []).some((tag) => tag.toLowerCase().includes(t));
			return matchesText && matchesTag;
		})
	);
</script>

<svelte:head>
	<title>Open VSX Tracker — extension download leaderboard</title>
	<meta
		name="description"
		content="Daily download and install statistics for Open VSX and VS Code Marketplace extensions."
	/>
</svelte:head>

{#snippet extIcon(row: LeaderboardRow, size: string)}
	{#if row.iconUrl}
		<img
			src={row.iconUrl}
			alt=""
			loading="lazy"
			class="{size} rounded-md border border-[var(--color-border)] object-contain bg-[var(--color-card)] shrink-0"
		/>
	{:else}
		<div
			class="{size} rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)] flex items-center justify-center text-xs font-semibold uppercase shrink-0"
		>
			{row.displayName.slice(0, 1)}
		</div>
	{/if}
{/snippet}

{#snippet deltaCell(value: number | null | undefined)}
	{#if value === null || value === undefined}
		<span class="text-[var(--color-muted-foreground)]">—</span>
	{:else if value > 0}
		<span class="text-[var(--color-emerald)] flex items-center justify-end gap-0.5">
			<TrendingUp class="h-3 w-3" />
			+{formatNumber(value)}
		</span>
	{:else if value < 0}
		<span class="text-[var(--color-rose)] flex items-center justify-end gap-0.5">
			<TrendingDown class="h-3 w-3" />
			{formatNumber(value)}
		</span>
	{:else}
		<span class="text-[var(--color-muted-foreground)]">
			<Minus class="h-3 w-3 inline" />
		</span>
	{/if}
{/snippet}

<div class="space-y-8">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-2xl font-bold">Extension Downloads</h1>
			{#if data.latestDate}
				<p class="text-sm text-[var(--color-muted-foreground)] mt-1">
					Last scraped: {data.latestDate}
				</p>
			{:else}
				<p class="text-sm text-[var(--color-muted-foreground)] mt-1">
					Scraping on startup — check back shortly.
				</p>
			{/if}
		</div>

		<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm">
			<div class="font-semibold text-xl">{data.totalCount}</div>
			<div class="text-[var(--color-muted-foreground)]">Extensions tracked</div>
		</div>
	</div>

	{#if data.movers.length > 0}
		<div class="space-y-3">
			<h2 class="font-semibold text-lg flex items-center gap-1.5">
				<Flame class="h-4 w-4 text-[var(--color-amber)]" />
				Top movers
				<span class="text-xs font-normal text-[var(--color-muted-foreground)]">
					{data.movers[0].delta7 != null ? 'past 7 days' : 'past 24 hours'}
				</span>
			</h2>
			<div class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
				{#each data.movers as mover (mover.id)}
					<a
						href="/{mover.namespace}/{mover.name}"
						class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-3 hover:bg-[var(--color-accent)] transition-colors min-w-0"
					>
						<div class="flex items-center gap-2">
							{@render extIcon(mover, 'h-8 w-8')}
							<div class="min-w-0">
								<div class="text-sm font-medium truncate">{mover.displayName}</div>
								<div class="text-xs text-[var(--color-emerald)] tabular-nums">
									+{formatNumber(mover.delta7 ?? mover.delta ?? 0)} downloads
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<div class="space-y-4">
		<div class="flex items-center gap-2 flex-wrap">
			<h2 class="font-semibold text-lg">Leaderboard</h2>
			{#if !isFiltering && data.rows.length < data.totalCount}
				<span class="text-xs text-[var(--color-muted-foreground)]">
					top {data.rows.length} — search covers all {data.totalCount}
				</span>
			{:else if isFiltering && !allRows && data.rows.length < data.totalCount}
				<span class="text-xs text-[var(--color-muted-foreground)]">loading full index…</span>
			{/if}
			<div class="ml-auto flex items-center gap-2">
				<input
					bind:value={tagSearch}
					oninput={ensureAllRows}
					placeholder="Filter by tag…"
					class="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 w-36"
					title="Tag search only works for extensions that have been visited at least once"
				/>
				<input
					bind:value={search}
					oninput={ensureAllRows}
					placeholder="Filter extensions…"
					class="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 w-48"
				/>
			</div>
		</div>

		<div class="rounded-lg border border-[var(--color-border)] overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
						<th class="px-3 py-3 sm:px-4 text-left font-medium text-[var(--color-muted-foreground)] w-14 sm:w-16">#</th>
						<th class="px-3 py-3 sm:px-4 text-left font-medium text-[var(--color-muted-foreground)]">Extension</th>
						<th class="px-3 py-3 sm:px-4 text-right font-medium text-[var(--color-muted-foreground)]">Downloads</th>
						<th class="px-3 py-3 sm:px-4 text-right font-medium text-[var(--color-muted-foreground)]">+24h</th>
						<th class="hidden sm:table-cell px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">+7d</th>
						<th class="hidden md:table-cell px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Trend</th>
						<th class="hidden lg:table-cell px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Version</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--color-border)]">
					{#each filtered as row (row.id)}
						<tr class="hover:bg-[var(--color-accent)] transition-colors">
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-[var(--color-muted-foreground)] tabular-nums text-xs sm:text-sm whitespace-nowrap">
								{row.rank}
								{#if row.rankDelta}
									{#if row.rankDelta > 0}
										<span class="text-[var(--color-emerald)] text-[10px]">
											<ArrowUp class="h-2.5 w-2.5 inline -mt-0.5" />{row.rankDelta}
										</span>
									{:else}
										<span class="text-[var(--color-rose)] text-[10px]">
											<ArrowDown class="h-2.5 w-2.5 inline -mt-0.5" />{-row.rankDelta}
										</span>
									{/if}
								{/if}
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
								<a href="/{row.namespace}/{row.name}" class="hover:underline">
									<div class="flex items-center gap-2.5">
										{@render extIcon(row, 'h-8 w-8')}
										<div class="min-w-0">
											<div class="flex items-center gap-1.5 font-medium leading-tight">
												{#if row.pinned}
													<Pin class="h-3 w-3 text-[var(--color-amber)] shrink-0" />
												{/if}
												<span class="truncate">{row.displayName}</span>
											</div>
											<div class="text-[var(--color-muted-foreground)] font-normal text-xs mt-0.5 truncate">
												{row.namespace}.{row.name}
											</div>
										</div>
									</div>
								</a>
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-right tabular-nums font-medium whitespace-nowrap text-xs sm:text-sm">
								{formatNumber(row.downloadCount)}
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-right tabular-nums text-xs whitespace-nowrap">
								{@render deltaCell(row.delta)}
							</td>
							<td class="hidden sm:table-cell px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">
								{@render deltaCell(row.delta7)}
							</td>
							<td class="hidden md:table-cell px-4 py-3 text-right">
								{#if row.sparkline}
									<div class="flex justify-end">
										<Sparkline values={row.sparkline} />
									</div>
								{:else}
									<span class="text-[var(--color-muted-foreground)] text-xs">—</span>
								{/if}
							</td>
							<td class="hidden lg:table-cell px-4 py-3 text-right whitespace-nowrap">
								<span class="text-xs text-[var(--color-muted-foreground)] font-mono">
									v{row.version}
								</span>
							</td>
						</tr>
					{/each}
					{#if filtered.length === 0}
						<tr>
							<td colspan="7" class="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
								{data.rows.length === 0 ? 'Scraping in progress…' : 'No results'}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
