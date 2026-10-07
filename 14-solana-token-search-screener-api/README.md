# Solana token screener

Companion code for the guide [Solana Token Screener API: Filters, Sorting and Pagination](https://www.solanatracker.io/resources/solana-token-search-screener-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Pump.fun API](https://www.solanatracker.io/pumpfun-api)

## What it does

- Calls `searchTokens` (`GET /search`) with liquidity, 24h volume, risk score, market and age filters read from `.env`
- Sorts server-side by any documented `sortBy` field (default `volume_24h`, descending)
- Pages through results with `nextCursor`, falling back to page numbers when no cursor is returned
- Deduplicates by mint and re-checks the numeric filters locally, because `data` can include up to 5 promoted rows on top of the organic page
- Prints an aligned table: symbol, mint, market, liquidity, market cap, 24h volume, holders, risk score and age

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended)
- A Solana Tracker Data API key from https://www.solanatracker.io/account/data-api. Each page is one REST request; the defaults fetch up to 3

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/14-solana-token-search-screener-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=14-solana-token-search-screener-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key |
| `SEARCH_QUERY` | No | Name, symbol or mint to search for. Empty = filters only |
| `MARKETS` | No | Comma-separated market ids such as `pumpfun-amm,raydium,meteora-dlmm`. Empty = all |
| `MIN_LIQUIDITY_USD` | No | Minimum liquidity in USD. Default `25000` |
| `MIN_VOLUME_24H_USD` | No | Minimum 24h volume in USD. Default `50000` |
| `MAX_RISK_SCORE` | No | Maximum risk score, 1-10 (higher = riskier). Default `6` |
| `MAX_AGE_HOURS` | No | Only tokens created in the last N hours. `0` = no limit |
| `SORT_BY` | No | Any documented sort field. Default `volume_24h` |
| `SORT_ORDER` | No | `asc` or `desc`. Default `desc` |
| `PAGE_SIZE` | No | Rows per request, 1-500. Default `20` |
| `MAX_PAGES` | No | Pages to fetch, 1-20. Default `3` |

## Sample output

Illustrative values; real results change minute to minute.

```text
Solana token screener
Filters: markets pumpfun-amm,raydium | liquidity >= $25,000 | 24h volume >= $50,000 | risk <= 6 | sort volume_24h desc

page 1: 22 rows
page 2: 20 rows
page 3: 20 rows

#  Symbol  Mint       Market       Liquidity  MCap    Vol 24h  Holders  Risk  Age
-  ------  ---------  -----------  ---------  ------  -------  -------  ----  ----
1  EXMPL   7xKX…AsU3  pumpfun-amm  $412.6K    $3.1M   $8.4M    12.31K   3     4d
2  SAMPL   9mHo…pump  raydium      $1.2M      $18.7M  $5.9M    41.2K    2     212d
3  DEMO    4k3D…kX6R  pumpfun-amm  $98.4K     $640K   $2.2M    3.9K     5     19h
...

Screener: 58 tokens shown of 1,284 matches, 2 rows dropped by local re-check (promoted or out-of-range)
```

## Extend it

- Run each screener hit through a full risk check before acting. See https://www.solanatracker.io/resources/check-solana-token-rug-risk-api
- Add holder-quality filters such as `maxTop10`, `maxSnipers`, `maxInsiders` or `maxBundlerPercentage` to `toSearchParams()`
- Pass `format: 'full'` (max 100 rows per page) when you need pools, events and the full `risk` object per row
- Stream live prices for the tokens you keep. See https://www.solanatracker.io/resources/realtime-solana-price-websocket
- Start from market-level activity to pick which `MARKETS` to screen. See https://www.solanatracker.io/resources/solana-lighthouse-market-activity-api

## Links

- Tutorial: [Solana Token Screener API: Filters, Sorting and Pagination](https://www.solanatracker.io/resources/solana-token-search-screener-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
