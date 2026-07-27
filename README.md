# Extension Downloads

Tracks Open VSX download counts and optional VS Code Marketplace install counts over time.

## Architecture

- GitHub Actions runs the scraper every day at 02:00 UTC.
- The scraper fetches all Open VSX extensions (with retries), batch-writes snapshots to Turso, discovers VS Code Marketplace IDs, and records install counts.
- The scraper exports `static/latest.json` (top 500 + pinned, with icons, 24h/7d deltas, rank changes and sparklines) and `static/latest-all.json` (slim rows for the full index, lazily fetched when searching), then commits both back to the repo.
- Cloudflare Pages serves the SvelteKit app as a static SPA.
- A same-origin Pages Function at `/api/extension` reads history and stored metadata from Turso. Successful responses are cached at the edge.
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

The default development command builds the static app and runs the Pages
Function locally. Wrangler reads the Turso credentials from the root `.env`
file.

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8788>. This is the complete application, including
`/api/extension`.

For frontend-only work with Vite's faster hot-module reload, use `pnpm
dev:vite`. Detail pages then require a Pages dev server on port 8787 or an
`API_PROXY_TARGET` pointing at a deployed site.

Restart `pnpm dev` after changing frontend source. Changes inside `functions/`
are picked up by Wrangler while it is running.

The index page reads `static/latest.json`. Generate it (and `static/latest-all.json`) from the current database with:

```sh
pnpm export:latest
```

Run the full daily job locally with:

```sh
pnpm scrape
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

The Pages project is `ovsx-statistics`; its production custom domain is
`extensions.f-kleinicke.de`. To build and deploy the static app and Pages
Function together:

```sh
pnpm deploy
```

The repository uses `wrangler.jsonc` as the source of truth. Wrangler uses the
locally authenticated Cloudflare account for manual deployments. The encrypted
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` values must remain configured in
the Pages project's production and preview environments.

The daily GitHub Action scrapes into Turso, regenerates the two JSON exports,
commits them to `main`, then calls the Pages deployment workflow. Normal pushes
to `main` also deploy automatically.

The deployment workflow requires the GitHub Actions secrets
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs the
**Account → Cloudflare Pages → Edit** permission. Until those CI credentials
are configured, run `pnpm deploy` manually after pulling or changing the
repository.
