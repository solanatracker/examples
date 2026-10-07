# Solana wallet PnL history in USD, SOL or EUR

Companion code for the guide [Solana Wallet PnL API: History, Currency and pnlMode](https://www.solanatracker.io/resources/solana-pnl-history-currency-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

- Fetches one wallet's lifetime PnL summary with `getPnlV2WalletOverview`: realized, unrealized and total PnL, invested, open positions, ROI, closed-token win rate, trade counts, average hold time and platform tags.
- Prints the most recent daily snapshots from `getPnlV2WalletHistory` (per-day realized PnL, buys, sells, volume and cumulative total) plus the window summary.
- Prints streaks, best and worst day, and max drawdown from `getPnlV2WalletPerformance` for the same window.
- Requests every monetary field in USD, SOL or EUR with the `currency` option and labels output with the denomination the API echoes back.
- Handles queued wallets: when a call returns `queued: true` it shows a pending line and polls again at 5, 10, 20, 40 then 60 seconds until `PNL_QUEUE_MAX_WAIT_SEC`.
- Validates inputs up front and retries rate limits and 5xx errors with capped backoff.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/20-solana-pnl-history-currency-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=20-solana-pnl-history-currency-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `WALLET_ADDRESS` | No | Wallet to analyze. Defaults to the sample wallet from the PnL v2 docs. |
| `PNL_CURRENCY` | No | `usd`, `sol` or `eur`. Default `usd`. |
| `PNL_PERIOD` | No | History and performance window: `1d`, `7d`, `14d`, `30d`, `90d` or `all`. Default `30d`. |
| `PNL_MODE` | No | Summary only: `strict`, `adjusted` or `raw`. Default `strict`. |
| `HISTORY_ROWS` | No | How many of the most recent days to print. Default `14`. |
| `PNL_QUEUE_MAX_WAIT_SEC` | No | Stop polling a queued wallet after this many seconds. Default `120`. |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the wallet and date.

```text
Summary for CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o (Cented)
pnlMode strict, currency SOL, updated 2026-10-07T07:58:12.004Z

Metric                        Value
----------------------------  -----------------------------
Realized PnL                  +58,210.44 SOL
Unrealized PnL                +7.61 SOL
Total PnL                     +58,218.05 SOL
Invested                      270,671.3 SOL
Open positions (cost / value) 27.83 SOL / 42.72 SOL
ROI                           21.5%
Win rate (closed tokens)      61.2% of 78518
...

Daily history, 30d (SOL), last 14 of 30 day(s)

Date        Realized       Buys  Sells  Volume         Cumulative total
----------  -------------  ----  -----  -------------  ----------------
2026-09-24  +104.12 SOL    680   274    1,024.61 SOL   +57,640.18 SOL
2026-09-25  +79.65 SOL     470   194    664.22 SOL     +57,719.83 SOL
...

Performance, 30-day window (SOL)
...
Max drawdown                  0 SOL (0.0%)
```

## Extend it

- Compare this wallet against the market with the top-trader leaderboard; see https://www.solanatracker.io/resources/solana-pnl-leaderboard-api.
- Show what the wallet holds right now next to its PnL; see https://www.solanatracker.io/resources/solana-wallet-portfolio-api.
- Drill into per-token results with `getPnlV2WalletPositions(wallet, { sort: 'realized', pnlMode })`, keeping the same `pnlMode` as the summary.
- Summarize many wallets in one request with `batchPnlV2WalletSummaries` (up to 100 wallets).
- Label counterparties and the wallet itself with identity data; see https://www.solanatracker.io/resources/solana-wallet-identity-enrichment.

## Links

- Tutorial: [Solana Wallet PnL API: History, Currency and pnlMode](https://www.solanatracker.io/resources/solana-pnl-history-currency-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
