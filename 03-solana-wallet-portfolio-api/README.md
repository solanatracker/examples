# Solana wallet portfolio tracker

Companion code for the guide [Solana Wallet Portfolio API: Holdings and Live Balances](https://www.solanatracker.io/resources/solana-wallet-portfolio-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

- Fetches every token a wallet holds with `getWallet` and prints balance, USD value, portfolio share, 24h price change, top-pool liquidity and risk score, sorted by value.
- Prints the wallet total in USD and SOL from the response's `total` and `totalSol`, and hides dust below `MIN_VALUE_USD`.
- With `ST_DATASTREAM_KEY` set, subscribes to `subscribe.wallet(address).balance()` and revalues each changed token with the price implied by the last snapshot.
- Maps Datastream's wrapped SOL mint to the native SOL row from REST, and re-fetches the snapshot when a new mint appears, after a reconnect and on a timer.
- Wraps REST calls with a per-attempt timeout and capped exponential backoff that honors rate-limit `retryAfter`; Ctrl+C unsubscribes and disconnects cleanly.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key. Live balance mode also needs Datastream access (Premium plan or higher).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/03-solana-wallet-portfolio-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=03-solana-wallet-portfolio-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `ST_DATASTREAM_KEY` | No | Datastream key or full `wss://` URL. Enables live balance updates. |
| `WALLET_ADDRESS` | No | Wallet to value. Defaults to the docs sample wallet. |
| `MIN_VALUE_USD` | No | Hide holdings below this USD value. Default `1`. |
| `SNAPSHOT_REFRESH_SEC` | No | Live mode only: how often to re-fetch the REST snapshot to re-price holdings. Default `300`. |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the wallet and current market.

```text
Portfolio for FbMxP3GVq8TQ36nbYgx4NP9iygMpwAwFWJwW81ioCiSF (snapshot 2026-10-07T09:12:44.120Z)

Token  Mint       Balance  Value      Share  24h    Liquidity  Risk
-----  ---------  -------  ---------  -----  -----  ---------  ----
SOL    So11…1111  41.27    $6,190.50  71.4%  -1.8%  $17.95M    1
USDC   EPjF…Dt1v  1.85K    $1,850.12  21.3%  +0.0%  $12.4M     1
BONK   DezX…B263  21.4M    $494.30    5.7%   +3.2%  $4.4M      1

Total $8,672.40 (57.818 SOL) across 9 token(s); 6 below $1.00 hidden

[datastream] connected

Watching FbMx…iCSF for balance changes. Ctrl+C to stop.
09:13:02  SOL        -0.5 -> 40.77  value $6,115.50  est. total $8,597.40
09:13:02  BONK       +2.1M -> 23.5M  value $542.81  est. total $8,645.91
09:18:02  snapshot refreshed (scheduled): $8,651.07 across 9 token(s)
```

## Extend it

- Add realized and unrealized PnL for the same wallet with the PnL v2 summary; see https://www.solanatracker.io/resources/solana-pnl-history-currency-api.
- Label the counterparties a wallet trades with; see https://www.solanatracker.io/resources/solana-wallet-identity-enrichment.
- Stream prices for the top holdings instead of re-fetching the snapshot on a timer; see https://www.solanatracker.io/resources/realtime-solana-price-websocket.
- Page through very large wallets with `getWalletPage(owner, page)` (250 tokens per page) instead of a single `getWallet` call.

## Links

- Tutorial: [Solana Wallet Portfolio API: Holdings and Live Balances](https://www.solanatracker.io/resources/solana-wallet-portfolio-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
