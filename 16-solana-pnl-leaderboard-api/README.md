# Solana PnL leaderboard

Companion code for the guide [Solana PnL Leaderboard API: Top Traders and KOL Rankings](https://www.solanatracker.io/resources/solana-pnl-leaderboard-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Enterprise](https://www.solanatracker.io/enterprise)

## What it does

- Ranks Solana wallets with `getPnlV2TopTraders` over a 1, 7, 30 or 90 day window, sorted by realized PnL or any other documented sort key.
- Applies the documented quality filters (`excludeArbitrage`, `platform`, `minTrades`, `minDays`, `maxSingleTokenPct`) and the `pnlMode` you choose, and prints the mode the API echoes back.
- Follows `pagination.nextCursor` unchanged for up to `PAGES` pages and reports whether more pages exist.
- Prints the KOL leaderboard for the same window with `getPnlV2KOLPeriodLeaderboard`, and the all-time KOL ranking with `getPnlV2KOLLeaderboard`.
- Shows wallet labels from the `identity` object (name, SNS domain or type) and falls back to the address when a wallet is unlabeled.
- Validates every input before calling the API and retries rate limits and 5xx errors with capped backoff.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/16-solana-pnl-leaderboard-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=16-solana-pnl-leaderboard-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `LEADERBOARD_DAYS` | No | Window in days: `1`, `7`, `30` or `90`. Default `30`. |
| `LEADERBOARD_SORT` | No | `realized`, `volume`, `days`, `roi`, `win_percentage`, `trades` or `tokens`. Default `realized`. |
| `PNL_MODE` | No | `strict`, `adjusted` or `raw`. Default `strict`. Applies to the top-trader table only. |
| `LIMIT` | No | Rows per page for the top-trader table, 1 to 100. Default `20`. |
| `PAGES` | No | Pages to follow with the cursor, 1 to 5. Default `1`. |
| `EXCLUDE_ARBITRAGE` | No | `false` includes wallets flagged as arbitrage bots. Default `true`. |
| `PLATFORM` | No | Comma-separated `axiom`, `axiom-flash`, `bloom`, `photon`. Empty means all. |
| `MIN_TRADES` | No | Minimum trades in the window. Empty uses the API default. |
| `MIN_DAYS` | No | Minimum active trading days. Empty uses the API default. |
| `MAX_SINGLE_TOKEN_PCT` | No | Maximum share of PnL from one token, in percent. |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real rankings change daily.

```text
Top Solana traders, last 30d, sorted by realized, pnlMode strict

#  Wallet     Label       Realized  ROI     Token win  Day win  Days  Trades
-  ---------  ----------  --------  ------  ---------  -------  ----  ------
1  HkFG…71nf              $2.91M    345.1%  93.9%      73.4%    27    9812
2  ApAK…tGM               $1.96M    394.2%  98.2%      n/a      21    7340
3  7xKX…AsU   example.sol $812.4K   61.0%   58.3%      66.7%    24    2210

20 wallet(s) shown; more pages available (raise PAGES)

KOL leaderboard, period 30d

#  KOL          Wallet     Realized  Volume   Days  Lifetime total
-  -----------  ---------  --------  -------  ----  --------------
1  crypto cir…  515v…NpRp  $191.7K   $492.8K  8     $29.93M
2  (unlabeled)  AuPp…qrf   $133.6K   $345.4K  8     $867.4K

KOL leaderboard, all-time
...
```

## Extend it

- Drill into one ranked wallet's history, best and worst days and drawdown; see https://www.solanatracker.io/resources/solana-pnl-history-currency-api.
- Rank traders of a single token instead of the whole market with `getPnlV2TokenTraders(mint, { sort: 'realized' })`; see https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api for the first-buyers variant.
- Shortlist wallets here, then pull their summaries in one call with `batchPnlV2WalletSummaries` (up to 100 wallets).
- Explain who the ranked wallets are with identity tags and SNS names; see https://www.solanatracker.io/resources/solana-wallet-identity-enrichment.

## Links

- Tutorial: [Solana PnL Leaderboard API: Top Traders and KOL Rankings](https://www.solanatracker.io/resources/solana-pnl-leaderboard-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Enterprise: [https://www.solanatracker.io/enterprise](https://www.solanatracker.io/enterprise)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
