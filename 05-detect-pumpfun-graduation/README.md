# Detect Pump.fun graduations

Companion code for the guide [Pump.fun Graduation API: Curve Alerts and Migrations](https://www.solanatracker.io/resources/detect-pumpfun-graduation).

Products: [Pump.fun API](https://www.solanatracker.io/pumpfun-api) · [Solana Data API](https://www.solanatracker.io/data-api) · [Raptor Swap API](https://www.solanatracker.io/raptor)

## What it does

- Joins the Datastream `pumpfun:curve:{CURVE_THRESHOLD}` room via `subscribe.curvePercentage("pumpfun", n)` and puts each token that crosses the threshold on a watchlist.
- Joins the `graduated` room, which covers every launchpad, and keeps only Pump.fun tokens (watchlist match, curve pool, `createdOn`, or a PumpSwap pool, strongest first).
- Prints the destination market and pool for each graduation and how long after the curve alert it migrated.
- Calls `GET /tokens/multi/graduated` on the first connect and after every reconnect (throttled) to fill gaps, deduplicating by mint.
- Expires stale watchlist entries after `WATCH_TTL_HOURS` and exits cleanly on Ctrl+C with a summary.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API plan with Datastream access (Premium or higher). Keys are in the [Data API dashboard](https://www.solanatracker.io/account/data-api).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/05-detect-pumpfun-graduation
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=05-detect-pumpfun-graduation%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key, used for `GET /tokens/multi/graduated` |
| `ST_DATASTREAM_KEY` | Yes | Datastream key or the full `wss://datastream.solanatracker.io/<key>` URL |
| `CURVE_THRESHOLD` | No | Curve percentage for the watchlist alert, integer 1-100 (default `90`) |
| `BACKFILL_LIMIT` | No | Rows of `/tokens/multi/graduated` per check, 0-500 (default `50`, 0 disables) |
| `REDUCE_SPAM` | No | Send `reduceSpam` to the graduated endpoint (default `true`) |
| `WATCH_TTL_HOURS` | No | Drop watchlist entries older than this (default `6`) |

## Sample output

Illustrative values; real rows depend on live launches.

```text
Pump.fun graduation monitor: curve alerts at 90%, REST gap fill 50 rows. Ctrl+C to stop.

[datastream] connected
14:10:02  GRAD (rest)  EXAMPLE       AmJa…pump    -> pumpfun-amm 6zSZ…KQFh liq $61.2K  via curve pool
14:10:02  GRAD (rest)  SAMPLE        5KtP…pump    -> pumpfun-amm GmJa…Hq2x liq $58.9K  via createdOn
[rest] 50 recent graduations checked, 2 new Pump.fun rows
14:11:40  CURVE>=90    DEMO          9xQe…pump    curve 90.4%  mcap $61.8K  liq $24.1K
14:14:52  GRADUATED    DEMO          9xQe…pump    -> pumpfun-amm 3kLp…Q9xd liq $63.5K  watched 3m12s
^C
Stopped. curve alerts 1, Pump.fun graduations 3 (1 from watchlist), other launchpads ignored 4, still watching 0
```

## Extend it

- Add a second, earlier threshold (for example 50%) and track tokens that stall between the two.
- Persist the watchlist and graduated set (Redis or Postgres) so restarts do not re-alert.
- Before trading a graduated token, request a fresh quote through Raptor rather than assuming the new pool is routable.
- Pull the earliest buyers of each graduated token with the [Pump.fun first buyers guide](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api).
- Catch tokens at launch instead of at migration with the [Pump.fun WebSocket launch stream](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket).

## Links

- Tutorial: [Pump.fun Graduation API: Curve Alerts and Migrations](https://www.solanatracker.io/resources/detect-pumpfun-graduation)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Raptor Swap API: [https://www.solanatracker.io/raptor](https://www.solanatracker.io/raptor)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
