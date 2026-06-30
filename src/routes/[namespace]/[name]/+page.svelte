<script lang="ts">
	import type { PageData } from './$types';
	import { formatNumber, formatNumberFull } from '$lib/utils.js';
	import DownloadChart from '$lib/components/DownloadChart.svelte';
	import { ArrowLeft, Pin, Tag, ExternalLink, GitBranch, Bug, Globe } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const totalDelta = $derived(
		data.history.length >= 2
			? data.history.at(-1)!.downloadCount - data.history.at(-2)!.downloadCount
			: null
	);

	const vsCodeDelta = $derived(
		data.vsCodeHistory.length >= 2
			? data.vsCodeHistory.at(-1)!.installCount - data.vsCodeHistory.at(-2)!.installCount
			: null
	);

	const openVsxUrl = $derived(`https://open-vsx.org/extension/${data.ext.namespace}/${data.ext.name}`);
	const vsCodeUrl = $derived(
		data.ext.vsCodeId
			? `https://marketplace.visualstudio.com/items?itemName=${data.ext.vsCodeId}`
			: null
	);
</script>

<div class="space-y-8">
	<!-- Back -->
	<a href="/" class="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors">
		<ArrowLeft class="h-4 w-4" />
		Back to leaderboard
	</a>

	<!-- Header: icon + title + links -->
	<div class="flex items-start gap-4 flex-wrap">
		{#if data.iconUrl}
			<img
				src={data.iconUrl}
				alt="{data.ext.displayName} icon"
				class="h-14 w-14 rounded-xl border border-[var(--color-border)] object-contain shrink-0"
				loading="lazy"
			/>
		{/if}

		<div class="flex-1 min-w-0 space-y-1">
			<div class="flex items-center gap-2 flex-wrap">
				{#if data.ext.pinned}
					<Pin class="h-4 w-4 text-[var(--color-amber)] shrink-0" />
				{/if}
				<h1 class="text-2xl font-bold">{data.ext.displayName}</h1>
			</div>
			<p class="text-sm text-[var(--color-muted-foreground)]">{data.ext.namespace}.{data.ext.name}</p>
			{#if data.description}
				<p class="text-sm text-[var(--color-foreground)] pt-1 max-w-2xl">{data.description}</p>
			{/if}
		</div>

		<!-- Marketplace + external links -->
		<div class="flex flex-wrap items-center gap-2 shrink-0">
			<a href={openVsxUrl} target="_blank" rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent)] transition-colors">
				<ExternalLink class="h-3.5 w-3.5" />Open VSX
			</a>
			{#if vsCodeUrl}
				<a href={vsCodeUrl} target="_blank" rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent)] transition-colors">
					<ExternalLink class="h-3.5 w-3.5" />VS Code Marketplace
				</a>
			{/if}
			{#if data.repoUrl}
				<a href={data.repoUrl} target="_blank" rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent)] transition-colors">
					<GitBranch class="h-3.5 w-3.5" />Repository
				</a>
			{/if}
			{#if data.homepageUrl && data.homepageUrl !== data.repoUrl}
				<a href={data.homepageUrl} target="_blank" rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent)] transition-colors">
					<Globe class="h-3.5 w-3.5" />Homepage
				</a>
			{/if}
			{#if data.bugsUrl}
				<a href={data.bugsUrl} target="_blank" rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent)] transition-colors">
					<Bug class="h-3.5 w-3.5" />Issues
				</a>
			{/if}
		</div>
	</div>

	<!-- Tags -->
	{#if data.tags.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each data.tags as tag}
				<span class="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-0.5 text-xs text-[var(--color-muted-foreground)]">
					{tag}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Open VSX stat cards -->
	<div>
		<h2 class="text-xs font-medium text-[var(--color-muted-foreground)] mb-3 uppercase tracking-wide">Open VSX</h2>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
				<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Total downloads</div>
				<div class="text-xl font-semibold tabular-nums">
					{data.latest ? formatNumberFull(data.latest.downloadCount) : '—'}
				</div>
			</div>
			<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
				<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Since yesterday</div>
				<div class="text-xl font-semibold tabular-nums">
					{#if totalDelta === null}—
					{:else if totalDelta >= 0}<span class="text-[var(--color-emerald)]">+{formatNumberFull(totalDelta)}</span>
					{:else}<span class="text-[var(--color-rose)]">{formatNumberFull(totalDelta)}</span>
					{/if}
				</div>
			</div>
			<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
				<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Current version</div>
				<div class="text-xl font-semibold font-mono">{data.latest ? `v${data.latest.version}` : '—'}</div>
			</div>
			<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
				<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Days tracked</div>
				<div class="text-xl font-semibold tabular-nums">{data.history.length}</div>
			</div>
		</div>
	</div>

	<!-- VS Code Marketplace stat cards -->
	{#if data.ext.vsCodeId}
		<div>
			<h2 class="text-xs font-medium text-[var(--color-muted-foreground)] mb-3 uppercase tracking-wide">VS Code Marketplace</h2>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
				<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
					<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Total installs</div>
					<div class="text-xl font-semibold tabular-nums">
						{data.latestVsCode ? formatNumberFull(data.latestVsCode.installCount) : '—'}
					</div>
				</div>
				<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
					<div class="text-xs text-[var(--color-muted-foreground)] mb-1">Since yesterday</div>
					<div class="text-xl font-semibold tabular-nums">
						{#if vsCodeDelta === null}—
						{:else if vsCodeDelta >= 0}<span class="text-[var(--color-emerald)]">+{formatNumberFull(vsCodeDelta)}</span>
						{:else}<span class="text-[var(--color-rose)]">{formatNumberFull(vsCodeDelta)}</span>
						{/if}
					</div>
				</div>
				<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
					<div class="text-xs text-[var(--color-muted-foreground)] mb-1">VS Code ID</div>
					<div class="text-sm font-mono text-[var(--color-muted-foreground)] truncate mt-1">{data.ext.vsCodeId}</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Chart -->
	<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6">
		<h2 class="font-semibold mb-4">Download history</h2>
		{#if data.history.length > 1}
			<DownloadChart history={data.history} vsCodeHistory={data.vsCodeHistory} />
		{:else}
			<p class="text-sm text-[var(--color-muted-foreground)] text-center py-16">
				Not enough data yet — check back after a second scrape.
			</p>
		{/if}
	</div>

	<!-- Version history -->
	{#if data.releases.length > 0}
		<div class="space-y-3">
			<h2 class="font-semibold text-lg">Version history</h2>
			<div class="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
				{#each data.releases as rel (rel.id)}
					<div class="flex items-start gap-4 px-4 py-3">
						<Tag class="h-4 w-4 mt-0.5 text-[var(--color-emerald)] shrink-0" />
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-mono text-sm font-medium text-[var(--color-emerald)]">v{rel.newVersion}</span>
								<span class="text-[var(--color-muted-foreground)] text-xs">from v{rel.oldVersion}</span>
							</div>
							<div class="text-xs text-[var(--color-muted-foreground)] mt-0.5">
								Detected {rel.detectedAt.slice(0, 16).replace('T', ' ')} UTC
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Snapshot log -->
	{#if data.history.length > 0}
		<div class="space-y-3">
			<h2 class="font-semibold text-lg">Snapshot log</h2>
			<div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
							<th class="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Scraped at (UTC)</th>
							<th class="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Open VSX DLs</th>
							{#if data.ext.vsCodeId}
								<th class="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">VS Code installs</th>
							{/if}
							<th class="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Version</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[var(--color-border)]">
						{#each [...data.history].reverse() as snap, i}
							{@const vsSnap = data.ext.vsCodeId ? [...data.vsCodeHistory].reverse()[i] : null}
							<tr class="hover:bg-[var(--color-accent)] transition-colors">
								<td class="px-4 py-2.5 font-mono text-xs text-[var(--color-muted-foreground)]">
									{snap.scrapedAt.slice(0, 19).replace('T', ' ')}
								</td>
								<td class="px-4 py-2.5 text-right tabular-nums">{formatNumberFull(snap.downloadCount)}</td>
								{#if data.ext.vsCodeId}
									<td class="px-4 py-2.5 text-right tabular-nums">
										{vsSnap ? formatNumberFull(vsSnap.installCount) : '—'}
									</td>
								{/if}
								<td class="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-muted-foreground)] whitespace-nowrap">
									v{snap.version}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
