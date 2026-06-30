<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import { Moon, Sun } from 'lucide-svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />

<div class="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
	<header class="border-b border-[var(--color-border)] px-3 py-3 sm:px-6 sm:py-4">
		<div class="mx-auto flex max-w-7xl items-center justify-between">
			<a href="/" class="text-lg font-semibold tracking-tight">
				Open VSX Tracker
			</a>
			<button
				onclick={toggleMode}
				class="rounded-md p-2 hover:bg-[var(--color-accent)] transition-colors"
				aria-label="Toggle dark mode"
			>
				<Sun class="h-4 w-4 hidden dark:block" />
				<Moon class="h-4 w-4 dark:hidden" />
			</button>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8">
		{@render children()}
	</main>
</div>
