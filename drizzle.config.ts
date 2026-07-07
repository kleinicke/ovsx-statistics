import { defineConfig } from 'drizzle-kit';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) throw new Error('TURSO_DATABASE_URL or DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'turso',
	dbCredentials: {
		url,
		authToken: process.env.TURSO_AUTH_TOKEN
	},
	verbose: true,
	strict: true
});
