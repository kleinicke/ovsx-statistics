<script lang="ts">
	import type { PageData } from './$types';
	import { formatNumber } from '$lib/utils.js';
	import { Pin, TrendingUp, TrendingDown, Minus } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let search = $state('');
	let tagSearch = $state('');

	const filtered = $derived(
		data.rows.filter((r) => {
			const s = search.toLowerCase();
			const t = tagSearch.toLowerCase().trim();
			const matchesText =
				!s ||
				r.displayName.toLowerCase().includes(s) ||
				`${r.namespace}.${r.name}`.toLowerCase().includes(s);
			const matchesTag = !t || r.tags.some((tag) => tag.toLowerCase().includes(t));
			return matchesText && matchesTag;
		})
	);
</script>

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
			<div class="font-semibold text-xl">{data.rows.length}</div>
			<div class="text-[var(--color-muted-foreground)]">Extensions tracked</div>
		</div>
	</div>

	<div class="space-y-4">
		<div class="flex items-center gap-2 flex-wrap">
			<h2 class="font-semibold text-lg">Leaderboard</h2>
			<div class="ml-auto flex items-center gap-2">
				<input
					bind:value={tagSearch}
					placeholder="Filter by tag…"
					class="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 w-36"
					title="Tag search only works for extensions that have been visited at least once"
				/>
				<input
					bind:value={search}
					placeholder="Filter extensions…"
					class="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 w-48"
				/>
			</div>
		</div>

		<div class="rounded-lg border border-[var(--color-border)] overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
						<th class="px-3 py-3 sm:px-4 text-left font-medium text-[var(--color-muted-foreground)] w-10 sm:w-12">#</th>
						<th class="px-3 py-3 sm:px-4 text-left font-medium text-[var(--color-muted-foreground)]">Extension</th>
						<th class="px-3 py-3 sm:px-4 text-right font-medium text-[var(--color-muted-foreground)]">Downloads</th>
						<th class="px-3 py-3 sm:px-4 text-right font-medium text-[var(--color-muted-foreground)]">+24h</th>
						<th class="hidden sm:table-cell px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Version</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--color-border)]">
					{#each filtered as row (row.id)}
						<tr class="hover:bg-[var(--color-accent)] transition-colors">
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-[var(--color-muted-foreground)] tabular-nums text-xs sm:text-sm">
								{row.rank}
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
								<a href="/{row.namespace}/{row.name}" class="hover:underline">
									<div class="flex items-center gap-1.5 font-medium leading-tight">
										{#if row.pinned}
											<Pin class="h-3 w-3 text-[var(--color-amber)] shrink-0" />
										{/if}
										<span class="truncate">{row.displayName}</span>
									</div>
									<div class="text-[var(--color-muted-foreground)] font-normal text-xs mt-0.5 truncate">
										{row.namespace}.{row.name}
									</div>
								</a>
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-right tabular-nums font-medium whitespace-nowrap text-xs sm:text-sm">
								{formatNumber(row.downloadCount)}
							</td>
							<td class="px-3 py-2.5 sm:px-4 sm:py-3 text-right tabular-nums text-xs whitespace-nowrap">
								{#if row.delta === null}
									<span class="text-[var(--color-muted-foreground)]">—</span>
								{:else if row.delta > 0}
									<span class="text-[var(--color-emerald)] flex items-center justify-end gap-0.5">
										<TrendingUp class="h-3 w-3" />
										+{formatNumber(row.delta)}
									</span>
								{:else if row.delta < 0}
									<span class="text-[var(--color-rose)] flex items-center justify-end gap-0.5">
										<TrendingDown class="h-3 w-3" />
										{formatNumber(row.delta)}
									</span>
								{:else}
									<span class="text-[var(--color-muted-foreground)]">
										<Minus class="h-3 w-3 inline" />
									</span>
								{/if}
							</td>
							<td class="hidden sm:table-cell px-4 py-3 text-right whitespace-nowrap">
								<span class="text-xs text-[var(--color-muted-foreground)] font-mono">
									v{row.version}
								</span>
							</td>
						</tr>
					{/each}
					{#if filtered.length === 0}
						<tr>
							<td colspan="5" class="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
								{data.rows.length === 0 ? 'Scraping in progress…' : 'No results'}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
