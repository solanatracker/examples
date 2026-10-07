# Solana token prices per pool and in batches

Companion code for the guide [Solana Token Price API: Pools, Batches and History](https://www.solanatracker.io/resources/get-solana-token-price-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Raptor Swap API](https://www.solanatracker.io/raptor)

## What it does

- Fetches every indexed pool for `TOKEN_MINT` with `getTokenInfo` and prints price, liquidity, liquidity share and freshness per pool, sorted by liquidity.
- Prints the price spread between pools, so you can see how much "the price" depends on the pool you read.
- Prints a single price snapshot from `getPrice` with 1h and 24h change, plus coarse history points from `getPriceHistory`.
- Prices a watchlist with `getMultiplePrices` in batches of up to 100 mints, joins results by mint key and marks tokens without a price as unavailable.
- Wraps every call with a per-attempt timeout and capped exponential backoff that honors rate-limit `retryAfter`.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key (any plan with Data API access).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/01-get-solana-token-price-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=01-get-solana-token-price-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `TOKEN_MINT` | No | Token for the pool table, snapshot and history. Defaults to wrapped SOL. |
| `WATCHLIST` | No | Comma-separated mints for the batch table. Defaults to SOL, USDC, JUP and BONK. |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the token and current market.

```text
SOL (So11…1112): 42 pool(s), $310.5M total liquidity

Market        Pool       Price USD  Liquidity  Share  Updated
------------  ---------  ---------  ---------  -----  -------
raydium-clmm  3ucN…sUxv  $150.12    $17.95M    5.8%   4s
orca          Czfq…44zE  $150.08    $15.2M     4.9%   6s
meteora-dlmm  5rCf…h6Pz  $150.15    $9.1M      2.9%   3s
… 32 smaller pool(s) omitted
Pool price spread: $149.90 to $150.31 (0.27%)

Snapshot: $150.11 | liquidity $17.95M | 1h +0.4% | 24h -2.1% | updated 4s ago
History:  now $150.11 | 3d $146.80 | 7d $152.30 | 30d $139.75

Watchlist (4 mint(s))

Mint       Price USD  Liquidity  Market cap  24h    Updated
---------  ---------  ---------  ----------  -----  -------
So11…1112  $150.11    $17.95M    $81.2B      -2.1%  4s
EPjF…Dt1v  $1.00      $12.4M     $8.9B       +0.0%  9s
JUPy…vCN   $0.512     $3.1M      $1.5B       -3.4%  12s
DezX…B263  $0.0000231 $4.4M      $1.9B       +1.2%  7s
```

## Extend it

- Stream the same token instead of polling with the aggregated price room; see https://www.solanatracker.io/resources/realtime-solana-price-websocket.
- Add candles for charts with `getChartData`; see https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api.
- Skip pools below a liquidity floor before you trust their price, and alert when the pool spread exceeds a threshold.
- Gate the watchlist on token risk before acting on a price; see https://www.solanatracker.io/resources/check-solana-token-rug-risk-api.

## Links

- Tutorial: [Solana Token Price API: Pools, Batches and History](https://www.solanatracker.io/resources/get-solana-token-price-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Raptor Swap API: [https://www.solanatracker.io/raptor](https://www.solanatracker.io/raptor)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
