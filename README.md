# Extension Downloads

Tracks Open VSX download counts and optional VS Code Marketplace install counts over time.

## Architecture

- GitHub Actions runs the scraper every day at 02:00 UTC.
- The scraper writes snapshots to Turso using Drizzle's libSQL adapter.
- The scraper exports `static/latest.json`, then commits that file back to the repo.
- Cloudflare Pages serves the SvelteKit app as a static SPA.
- Extension detail pages call a Cloudflare Worker at `/api/extension`, which reads history from Turso.

## Environment

For local libSQL/SQLite development:

```sh
DATABASE_URL=file:local.db
```

For Turso:

```sh
TURSO_DATABASE_URL=libsql://your-database-org.turso.io
TURSO_AUTH_TOKEN=...
```

Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as GitHub Actions secrets before enabling the scheduled workflow.

## Developing

```sh
pnpm install
pnpm dev
```

The index page reads `static/latest.json`. Generate it from the current database with:

```sh
pnpm export:latest
```

Run the full daily job locally with:

```sh
pnpm scrape
```

## Database

```sh
pnpm db:generate
pnpm db:migrate
```

## Deploying

Cloudflare Pages can build the static app with:

```sh
pnpm build
```

Deploy the Worker in `worker/` and route `/api/extension` to it. Start from `worker/wrangler.toml.example` and set `TURSO_AUTH_TOKEN` with:

```sh
wrangler secret put TURSO_AUTH_TOKEN
```
