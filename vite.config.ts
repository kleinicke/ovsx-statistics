import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		// `pnpm dev:vite` is the frontend-only fast path. It proxies detail API
		// requests to a separately running Pages dev server or deployed URL.
		// The default `pnpm dev` command serves the complete Pages application.
		proxy: {
			'/api': {
				target: process.env.API_PROXY_TARGET ?? 'http://localhost:8787',
				changeOrigin: true
			}
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' }),
			typescript: {
				config: (config) => ({
					...config,
					include: [...config.include, '../drizzle.config.ts']
				})
			}
		})
	]
});
