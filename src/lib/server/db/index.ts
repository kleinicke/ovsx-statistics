import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) throw new Error('TURSO_DATABASE_URL or DATABASE_URL is not set');

const client = createClient({
	url,
	authToken: process.env.TURSO_AUTH_TOKEN
});

export const db = drizzle(client, { schema });
