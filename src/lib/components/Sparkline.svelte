<script lang="ts">
	let {
		values,
		width = 88,
		height = 24
	}: { values: (number | null)[]; width?: number; height?: number } = $props();

	const coords = $derived.by(() => {
		const nums = values.filter((v): v is number => v !== null);
		if (nums.length === 0) return [];
		const min = Math.min(...nums);
		const range = Math.max(...nums) - min || 1;
		const step = values.length > 1 ? width / (values.length - 1) : 0;
		return values
			.map((v, i) =>
				v === null
					? null
					: ([i * step, height - 2 - ((v - min) / range) * (height - 4)] as [number, number])
			)
			.filter((p): p is [number, number] => p !== null);
	});

	const points = $derived(coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
</script>

{#if coords.length > 1}
	<svg {width} {height} viewBox="0 0 {width} {height}" class="text-[var(--color-chart)]" aria-hidden="true">
		<polyline
			{points}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	</svg>
{:else if coords.length === 1}
	<svg {width} {height} viewBox="0 0 {width} {height}" class="text-[var(--color-chart)]" aria-hidden="true">
		<circle cx={width / 2} cy={coords[0][1]} r="2" fill="currentColor" />
	</svg>
{/if}
