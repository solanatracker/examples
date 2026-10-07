# Solana market activity leaderboard

Companion code for the guide [Solana Market Activity API: DEX and Launchpad Stats](https://www.solanatracker.io/resources/solana-lighthouse-market-activity-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Pump.fun API](https://www.solanatracker.io/pumpfun-api)

## What it does

- Calls `getLighthouse` (`GET /lighthouse`) once, or on an interval when `WATCH_SECONDS` is set
- Prints the `all` row across the 5m, 1h, 6h and 24h windows: volume, trades, approximate unique wallets, launches, migrations and buy share of volume
- Ranks markets by any metric (`SORT_METRIC`) for one window (`LIGHTHOUSE_WINDOW`), top-level markets only unless `INCLUDE_CHILD_MARKETS=true`
- Never sums market rows, because family rows and child launchpads overlap; the overall view comes from the `all` row
- Wraps every request in a timeout and capped retry, and in watch mode keeps showing the last good snapshot (with its time) when a refresh fails

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended)
- A Solana Tracker Data API key from https://www.solanatracker.io/account/data-api. Each refresh is one REST request

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/19-solana-lighthouse-market-activity-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=19-solana-lighthouse-market-activity-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key |
| `LIGHTHOUSE_WINDOW` | No | Leaderboard window: `5m`, `1h`, `6h` or `24h`. Default `1h` |
| `SORT_METRIC` | No | `volume`, `transactions`, `wallets`, `tokensCreated` or `migrations`. Default `volume` |
| `TOP_N` | No | Markets to show, 1-100. Default `10` |
| `INCLUDE_CHILD_MARKETS` | No | `true` to include rows that have a `parent` (child launchpads). Default `false` |
| `WATCH_SECONDS` | No | Refresh interval, 15-3600 seconds. `0` = fetch once and exit. Default `0` |

## Sample output

Illustrative values; real numbers change every refresh.

```text
Solana market activity (Lighthouse) at 14:02:11 UTC, 24 markets

Overall (All)
Window  Volume  Chg    Trades  Chg    Wallets*  Chg    Launches  Migrations  Buy vol
------  ------  -----  ------  -----  --------  -----  --------  ----------  -------
5m      $1.5M   +5.5%  12K     +4.2%  9K        +2.1%  400       8           52%
1h      $16M    -5.5%  140K    -4.2%  52K       -2.1%  4.1K      61          51%
6h      $91M    +2.7%  820K    +2.1%  180K      +1.1%  23K       350         52%
24h     $340M   -1.4%  3.1M    -1.1%  510K      -0.5%  88K       1.3K        50%
* approximate unique wallets. Chg = vs the previous window of the same length.

Top 4 top-level markets by volume, 1h window
#  Market         Label          Parent  Volume  Chg     Trades  Wallets*  Launches  Migrations  Buy vol
-  -------------  -------------  ------  ------  ------  ------  --------  --------  ----------  -------
1  pumpfun-amm    PumpSwap               $7.04M  +4.9%   61.6K   22.9K     0         27          52%
2  pumpfun        Pump.fun               $4.96M  -7.9%   43.4K   16.1K     1.27K     19          53%
3  raydium-all    Raydium                $1.92M  -3.1%   16.8K   6.24K     492       7           49%
4  meteora-curve  Meteora Curve          $800K   -14.3%  7K      2.6K      205       3           55%
```

## Extend it

- Screen tokens on a busy venue by passing a matching search market id (such as `pumpfun-amm`) to the screener's `MARKETS`. Family keys like `raydium-all` are Lighthouse rollups, not search markets. See https://www.solanatracker.io/resources/solana-token-search-screener-api
- Store each snapshot with its timestamp to chart activity over days, since the endpoint only returns the current rolling windows
- Alert when a market's `changePct` crosses a threshold, but only above a minimum absolute volume so tiny baselines do not fire
- Watch launches turn into migrations in real time. See https://www.solanatracker.io/resources/detect-pumpfun-graduation
- Run a risk check on tokens before acting on market-level signals. See https://www.solanatracker.io/resources/check-solana-token-rug-risk-api

## Links

- Tutorial: [Solana Market Activity API: DEX and Launchpad Stats](https://www.solanatracker.io/resources/solana-lighthouse-market-activity-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
