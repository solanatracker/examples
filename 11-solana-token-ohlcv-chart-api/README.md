# Solana OHLCV candles with gap handling

Companion code for the guide [Solana OHLCV API: Candles, Intervals and Gaps](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api)

## What it does

- Fetches OHLCV candles for `TOKEN_MINT` with `getChartData`, or for one pool with `getPoolChartData` when `POOL_ADDRESS` is set.
- Validates the interval against the documented values and supports `usd`, `eur` or `sol` candles and market-cap candles.
- Splits long time ranges into windows, fetches them sequentially with timeouts and backoff, then merges, dedupes by `time` and sorts the candles.
- Detects missing intervals (gaps) and optionally fills them with flat zero-volume candles.
- Prints the most recent candles as a table plus a range summary: open to close change, high, low, total volume and gap count.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/11-solana-token-ohlcv-chart-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=11-solana-token-ohlcv-chart-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `TOKEN_MINT` | No | Token to chart. Defaults to wrapped SOL. |
| `POOL_ADDRESS` | No | Chart this pool only (`getPoolChartData`). |
| `CHART_INTERVAL` | No | `1s` to `1mn`; default `1h`. |
| `CHART_DAYS` | No | Days of history to fetch (default 7). |
| `CHART_CURRENCY` | No | `usd`, `eur` or `sol` (default `usd`). |
| `MARKET_CAP` | No | `true` for market-cap candles (default `false`). |
| `FILL_GAPS` | No | `true` fills missing intervals with flat zero-volume candles. |
| `WINDOW_CANDLES` | No | Candles per request window when splitting a range (default 1000). |
| `SHOW_LAST` | No | Recent candles to print (default 12). |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the token and the time range.

```text
So11…1112 1h price candles in USD (all pools), 2026-09-30 14:00 to 2026-10-07 13:00 UTC: 168 candle(s) from 1 request(s)

Time (UTC)        Open     High     Low      Close    Volume  Change
----------------  -------  -------  -------  -------  ------  ------
2026-10-07 10:00  $149.70  $150.60  $149.00  $150.00  4.1M    +0.20%
2026-10-07 11:00  $150.00  $151.04  $149.44  $150.44  3.8M    +0.29%
2026-10-07 12:00  $150.44  $151.25  $149.65  $150.65  5.2M    +0.14%
2026-10-07 13:00  $150.65  $151.46  $149.86  $150.86  2.9M    +0.14%

Range: open $146.10 -> close $150.86 (+3.26%), high $153.90, low $144.30, volume 702.4M
Gaps: none
```

## Extend it

- Stream live prices on top of the last candle; see https://www.solanatracker.io/resources/realtime-solana-price-websocket.
- Build the current candle yourself from live trades between refreshes; see https://www.solanatracker.io/resources/stream-solana-trades-websocket.
- Cache closed candles by `(token, pool, interval, currency, time)` and only refetch the open one.
- Export the merged series to CSV or feed it into a charting library that expects `{ time, open, high, low, close, volume }`.

## Links

- Tutorial: [Solana OHLCV API: Candles, Intervals and Gaps](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
