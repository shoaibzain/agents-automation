# Agents Automation Plan

## Build status (2026-09-22)

The first working version is in [Agents Automation](README.md): automatic discovery through a third-party Daraz marketplace search API, CSV/HTTPS JSON feed alternatives, SQLite daily snapshots, 7-day comparisons, local dashboard, CSV export, and a Windows daily task. On 2026-09-22, a live six-search run saved 239 unique listings. All 239 had prices, 226 had review counts, and none had sold counts. The scheduled task is ready for 09:00 Pakistan time starting 2026-09-23; a manual task check exited successfully without duplicating today's snapshot. **The six-page daily scan is a sample, not full marketplace coverage.**

## Goal

Run **once per day** to identify promising Daraz Pakistan products and meaningful changes in demand and competition. Save the evidence behind every recommendation so a seller can inspect it before sourcing stock. The agent researches and reports; it does not buy inventory or publish listings.

## Daily workflow

1. At a configured time in Pakistan Standard Time, start one run. Prevent overlapping runs.
2. Load the tracked categories, keywords, products, and source settings.
3. Collect the latest permitted product data. Save the source URL, collection time, and raw values.
4. Normalize product identity, prices in PKR, sold counts, ratings, review counts, seller details, and availability. Mark missing or ambiguous fields instead of guessing.
5. Compare each product with the previous snapshots. Calculate 1-day, 7-day, and 30-day changes only when enough history exists.
6. Rank candidates and generate a dated dashboard/report with evidence links and reasons for each score.
7. Record collection failures, stale sources, and coverage. Notify the user only if a notification channel is configured.

## Data sources and limits

- **Current connector:** the independent [Parse Daraz API](https://parse.bot/marketplace/92b641f0-875d-4881-855a-3ee7d8c250d2/daraz-pk-api) can discover product listings automatically by search/category. It is not official Daraz access. Six default pages per day are sample coverage; scan budget and provider access determine how much of the marketplace can be checked.
- **For full coverage:** obtain an authorized/licensed marketplace feed or enough API capacity to enumerate categories and pages daily. Verify its fields, access terms, rate limits, and cost before expansion.
- **Optional:** authorized Seller Center/Open Platform data for the user's own shop. Treat this as store performance, not proof of market-wide top sellers.
- **Fallback MVP:** manually imported CSV files or a curated list of product URLs. This can track selected products but cannot claim to discover the whole marketplace's top products.
- Daraz's current `robots.txt` disallows automated crawling of `/catalog/`; the system must not depend on crawling those search pages. Do not bypass access controls or anti-bot measures.
- A public sold count may be rounded, cumulative, delayed, or absent. Label calculated growth as an **observed proxy**, never verified unit sales. A single day's snapshot cannot establish a trend.

Source references: [Daraz robots.txt](https://www.daraz.pk/robots.txt), [Daraz Open Platform](https://open.daraz.com/), [API getting started](https://open.daraz.com/doc/doc.htm).

## Data model

- `products`: stable Daraz item ID or canonical URL, title, category, brand, seller, first seen, last seen.
- `snapshots`: product ID, captured timestamp, price, original price, visible sold count/text, rating, review count, stock/availability, listing URL, source, extraction status.
- `runs`: start/end time, source, products attempted/succeeded, errors, report path.
- `costs` (optional): supplier quote, MOQ, shipping, Daraz fees, returns allowance, ad cost, quote date and source.

Store snapshots in SQLite. Keep raw source values alongside normalized numbers so changes in parsing can be audited.

## Ranking and report

Show separate measures rather than one unexplained AI score:

| Measure | Initial rule |
| --- | --- |
| Demand signal | Visible sold count and review activity, where available |
| Momentum | Change in observed sold count and reviews over 7/30 days |
| Competition | Number of comparable listings in the supplied feed/category |
| Price position | Current price versus comparable listings and its own history |
| Margin estimate | User-provided landed cost minus fees, delivery, returns, and ads |
| Data confidence | Coverage, snapshot history, source freshness, and field quality |

The daily report should contain **Rising products**, **High demand**, **Price movers**, **Watchlist changes**, and **Data gaps**. Each row shows the product link, current values, comparison period, calculation, and collection timestamp. Do not label a product profitable until cost inputs are supplied and calculated.

## MVP build order

1. **Source decision:** choose a data feed or start with CSV/curated URLs; confirm categories and approximate daily product count.
2. **Collector and storage:** import source records, deduplicate products, write snapshots, and log failures.
3. **Analysis:** calculate deltas and transparent ranking rules; handle new listings and missing fields.
4. **Dashboard:** searchable daily report with product evidence and CSV export.
5. **Scheduling:** run once daily in Pakistan time with retry limits and a manual “Run now” action.
6. **Pilot:** track a small set for at least 7 days, inspect calculations against source pages/feed, then expand coverage.

## Suggested implementation

- Node.js collector and web dashboard in this workspace.
- SQLite for snapshots and run history.
- Windows Task Scheduler for a local daily run, or a hosted scheduler if the machine should not stay on.
- Optional Jev decision call only after deterministic metrics are calculated, to classify the opportunity and explain which items deserve review. Keep the numeric evidence and final ranking visible; the agent must work without Jev when its API is unavailable.

## Acceptance criteria

- One scheduled run per day; repeated starts do not duplicate the same snapshot.
- Every recommendation links to a source and shows when it was captured.
- Trends appear only after sufficient historical snapshots; missing data stays visible.
- A failed source does not erase prior history or produce a false “zero sales” trend.
- The report separates observed market signals from supplier-confirmed cost and margin.
- The pilot report is checked against real source records before calling the agent reliable.

## Decisions needed before connecting live data

1. Whole Daraz Pakistan marketplace, the user's own store, or both? Default assumption: marketplace research, with own-store data optional.
2. Which categories/keywords should the first daily run cover?
3. Which permitted data feed or access credentials are available? If none, start with CSV or a curated watchlist.
4. Where should the daily job run, and should it send a report by email/WhatsApp or only save it locally?

## Implemented refinement — price range and persistent watchlist

Discovery now defaults to PKR 500–3,000, with provider-side and local filtering. Twenty-one products from the first live snapshot are saved in a persistent watchlist. The six-call budget is split into three rotating discovery searches and three direct watchlist checks per daily run. The six themes rotate over two runs; a full watchlist rotates in about seven runs. Saved items survive search disappearance and price-range changes. Direct checks pin a SKU and price comparisons require matching source/variant. The dashboard exposes the watchlist, observation dates, and last direct checks. The live filter/detail probes, nine automated checks, and rendered browser watchlist check passed. Tomorrow's 09:00 task will use this configuration without altering today's completed snapshot.
