# Extension Downloads

Tracks Open VSX download counts and optional VS Code Marketplace install counts over time.

## Architecture

- GitHub Actions runs the scraper every day at 02:00 UTC.
- The scraper fetches all Open VSX extensions (with retries), batch-writes snapshots to Turso, discovers VS Code Marketplace IDs, and records install counts.
- The scraper exports `static/latest.json` (top 500 + pinned, with icons, 24h/7d deltas, rank changes and sparklines) and `static/latest-all.json` (slim rows for the full index, lazily fetched when searching), then commits both back to the repo.
- Cloudflare Pages serves the SvelteKit app as a static SPA.
- Extension detail pages call a Cloudflare Worker at `/api/extension`, which reads history from Turso and serves stored metadata (refreshing it from Open VSX in the background).
- The workflow fails (visibly) when the scrape records nothing or exceeds a 5% error rate, and the export refuses to overwrite good data with an empty ranking.

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

The index page reads `static/latest.json`. Generate it (and `static/latest-all.json`) from the current database with:

```sh
pnpm export:latest
```

Run the full daily job locally with:

```sh
pnpm scrape
```

Detail pages call `/api/extension`, which the dev server proxies to `http://localhost:8787` (override with `API_PROXY_TARGET`). Run the Worker locally with:

```sh
cd worker
cp wrangler.toml.example wrangler.toml   # once; point it at your database
wrangler dev
```

## Database

The dev database (`local.db`) is managed with push:

```sh
pnpm db:push
```

CI and Turso use the checked-in migrations:

```sh
pnpm db:generate
pnpm db:migrate
```

### Importing historical local databases

Create a fresh local target with the checked-in migrations, then merge source
databases from oldest to newest. Sources are never modified; extensions are
matched by `namespace`/`name`, and same-day conflicts use the latest
`scraped_at` value.

```sh
DATABASE_URL=file:merged.db pnpm db:migrate
pnpm merge:local merged.db local.db local23_7.db local_24_7.db local_27_7.db
```

After validating the merged database, migrate an empty Turso database and
import it:

```sh
pnpm db:migrate
pnpm import:turso merged.db
```

The Turso importer refuses to run when the remote `extensions` table is not
empty.

## Deploying

Cloudflare Pages can build the static app with:

```sh
pnpm build
```

Deploy the Worker in `worker/` and route `/api/extension` to it. Start from `worker/wrangler.toml.example` and set `TURSO_AUTH_TOKEN` with:

```sh
wrangler secret put TURSO_AUTH_TOKEN
```
