# Agents Automation

Working MVP for **one daily run**. It can automatically discover Daraz Pakistan listings through a marketplace search API, save daily snapshots, compare historical values, and show a dashboard. Local runs use SQLite; Vercel production uses private Vercel Blob storage. CSV and HTTPS JSON feeds remain available as alternatives. It does **not** crawl Daraz catalog search pages or claim that a sampled search covers every listing.

## Requirements

Node.js 22.13+ (tested on Node.js 25) and Windows PowerShell for scheduled task setup. Node's built-in SQLite module currently prints an experimental warning.

## Automatic marketplace discovery

Copy `config.example.json` to `config.json`. The default configuration discovers products priced PKR 500–3,000. With a full watchlist, each run uses three rotating search pages and three direct product-detail checks, within the same six-call limit. All six configured search themes are visited over two runs. The search terms are **discovery instructions**, not a list of your products. Set a [Parse API](https://parse.bot/marketplace/92b641f0-875d-4881-855a-3ee7d8c250d2/daraz-pk-api) key as `PARSE_API_KEY` in the environment. Then run `node src/run.mjs`.

The Parse API is an independent third-party wrapper, not Daraz's official API. Its page currently advertises 200 free credits/month, 5 requests/minute, and about 40 results per search page. Six total calls a day use about 180 credits in a 30-day month, before any verification or other calls. **This samples the configured searches; it does not cover the full Daraz marketplace.** Broader daily coverage needs a higher API budget or another licensed feed. Confirm current pricing and usage rights with the provider before scaling.

The search response shown in its public documentation contains price, rating, and review count but does not show a sold count. The dashboard therefore uses review growth and price changes when sold count is unavailable. It never substitutes reviews for actual sales.

For a Windows scheduled task, store the key in your **user** environment variables so the task can read it:

```powershell
[Environment]::SetEnvironmentVariable('PARSE_API_KEY','your-key-here','User')
```

Open a new PowerShell session after setting it. Do not put the key in `config.json`.

## Alternative data source

Set `source` to another value and `feedUrl` to an approved HTTPS endpoint returning an array, or put a CSV in `data/inbox/`. CSV takes priority for that run. Required columns are `id,title,url`; supported optional columns are `category,seller,price,sold_count,review_count,rating,availability`. Product URLs must be HTTPS Daraz Pakistan links. Counts must be exact integers from the source; do not convert rounded labels such as `1.2K` into exact counts.

Example CSV:

```csv
id,title,url,category,seller,price,sold_count,review_count,rating,availability
12345,Example product,https://www.daraz.pk/products/example-i12345.html,Home,Example Seller,799,120,18,4.5,in_stock
```

Or a feed can return the same records as a JSON array. Use stable product IDs and collect the same products on repeated days. Store any feed credential on the server, not in the web page. The generic feed connector supports HTTPS URLs without custom auth headers; add a source-specific adapter for authenticated feeds.

## Run and view

From this folder:

```powershell
node src/run.mjs
node src/server.mjs
```

Open <http://localhost:3100>. The collector moves processed CSV files to `data/processed/`. A completed day cannot be rerun, protecting history from accidental overwrite. To test historical snapshots, `AGENTS_AUTOMATION_RUN_DAY=YYYY-MM-DD` can set the run date; do not use this for routine collection. The previous environment name remains accepted for compatibility.

## Vercel production deployment

Production deploys from the GitHub `main` branch. Create a **private Vercel Blob** store for the project and add these Production environment variables:

- `PARSE_API_KEY`: marketplace provider key
- `BLOB_READ_WRITE_TOKEN`: added automatically when the Blob store is connected
- `CRON_SECRET`: a long random value used by Vercel to authorize the cron request

The included `vercel.json` calls `/api/cron` once daily at `04:00 UTC`, which is `09:00` in Pakistan. Vercel sends `Authorization: Bearer <CRON_SECRET>`. The endpoint rejects unauthenticated calls, records a run lock, and skips a date that has already completed. The initial hosted snapshot is exported from the local database in `seed/agents-automation-state.json`; the first hosted run creates the persistent Blob state.

The public dashboard calls `/api/report`. API keys and the private Blob token stay in Vercel server environment variables and are never sent to the browser. After the production cron is verified, disable the Windows scheduled task to avoid duplicate provider calls. Vercel cron schedules use UTC, and Hobby plans run daily jobs with coarse timing rather than exact-to-the-minute execution.

For marketplace discovery or a recurring feed, run `./install-agents-automation-task.ps1 -Time '09:00'` in PowerShell. This registers a Windows task under the current user. The runner reads the user API key at each run and appends results/errors to `data/agents-automation.log`. The PC must be on and its timezone set to Pakistan time. For a one-off CSV, the task will need a new CSV each day. Start the dashboard separately when you want to view results.

## Current limits

- The ranking shows observed 7-day sold-count and review changes. It needs at least 7 days of history; no synthetic trend is shown on day one.
- The automatic connector samples configured searches and directly refreshes saved watchlist products. It does not enumerate every Daraz product, and its public example omits sold count. The run record names the number of pages sampled.
- Public sold counts may be rounded or delayed. These are signals, not verified sales.
- Marketplace-wide top products require a licensed/authorized source with sufficient coverage. Seller Center data describes only the authorized shop.
- Costs, fees, and margin calculations are planned but not yet connected because supplier and fee inputs are not available.
- No email or WhatsApp notification is configured.

See [the full plan](AGENTS_AUTOMATION_PLAN.md) for the next phases and source decisions.

## Persistent tracking and price filters

`priceMin` and `priceMax` control discovery (defaults 500 and 3000 PKR). Filters are sent to the provider and enforced locally if it returns out-of-range listings. Previous snapshots are retained; the dashboard shows matching current discoveries and all saved watchlist items.

`watchlistLimit` defaults to 21. The initial watchlist is selected across the available search themes, using review count to choose candidates within each theme. This is an initial monitoring selection, not evidence that those items are trending. Once selected, items remain saved when they disappear from search results or move outside the discovery price range.

`watchlistChecksPerRun` defaults to 3. The oldest attempted items are checked first via the product-detail endpoint. A full 21-item watchlist takes about seven successful daily runs to check once. Failed checks retain the previous snapshot, show the error, and rotate through the queue. Unused watchlist slots are filled from eligible discoveries. The dashboard's **Persistent watchlist** filter shows each item's observation date and last direct-check date.

The first direct check pins the product variant. Later detail prices use that same variant; a missing variant produces an unknown price. Price-change alerts compare only the same price source/variant. Review/sold change signals show the actual baseline date because rotating checks may be more than seven days apart.

On 2026-09-22, the live price-filter probe returned four eligible listings and the direct-detail adapter was verified on a real product. Today's existing daily snapshot was preserved. The next scheduled run uses the new split. Nine automated tests passed, including a complete mocked daily run and duplicate-run prevention.
