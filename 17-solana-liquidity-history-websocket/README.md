# Solana liquidity events: REST backfill + live stream

Companion code for the guide [Solana Liquidity Events API: LP History and Live Stream](https://www.solanatracker.io/resources/solana-liquidity-history-websocket).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc)

## What it does

- Backfills liquidity additions and removals for a token (or one pool of it) with `getTokenTradeHistory` / `getPoolTradeHistory` and `events: 'liquidity'`, following the opaque `nextCursor` for `HISTORY_PAGES` pages.
- Prints an aligned table of LP actions and the exact net token flow per mint, summed with `BigInt` from `amountRaw` strings (no floating point).
- Subscribes to the matching Datastream room (`subscribe.liquidity.token` or `.tokenPool`) and prints each live LP event marked as provisional.
- Reconciles provisional live events against confirmed REST history on a timer and after every reconnect, using a counted match key instead of signature dedupe.
- Runs the REST part only, with a note, when `ST_DATASTREAM_KEY` is not set.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key for the REST backfill.
- Optional: Datastream access (Premium plan or higher) for the live part.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/17-solana-liquidity-history-websocket
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=17-solana-liquidity-history-websocket%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `ST_DATASTREAM_KEY` | No | Datastream key or full `wss://` URL. Without it, only the backfill runs. |
| `TOKEN_MINT` | No | Token mint to follow. Defaults to the docs example token. |
| `POOL_ADDRESS` | No | Narrows history and the live room to one pool of `TOKEN_MINT`. |
| `HISTORY_PAGES` | No | History pages to backfill, 1-20 (default 3). |
| `PAGE_LIMIT` | No | Rows per page, 1-500 (default 100). |
| `ENRICH_IDENTITY` | No | `true` adds current wallet identity (REST `enrich=identity`, live `:enriched` room). |
| `RECONCILE_INTERVAL_SECONDS` | No | Seconds between reconciliation passes (default 60, minimum 10). |
| `PROVISIONAL_TTL_MINUTES` | No | Minutes before an unconfirmed live event is dropped from view (default 5). |

## Sample output

Illustrative values; your output depends on the token and current activity.

```text
Liquidity history for 6p6x…iGPN (newest first)

Time (UTC)           Action  Program      Pool       Provider   Tokens
-------------------  ------  -----------  ---------  ---------  -----------------------------------------------
2026-10-07 13:58:41  REMOVE  pumpfun-amm  9d9m…ZF4u  4kQn…8sTa  -1520.334101 6p6x…iGPN, -61.250021991 So11…1112
2026-10-07 13:41:07  ADD     pumpfun-amm  9d9m…ZF4u  Cw2L…p1Dd  +800.5 6p6x…iGPN
2026-10-07 12:55:19  ADD     pumpfun-amm  3Hk7…aQ2e  7Yhs…Kd3M  +210.000001 6p6x…iGPN, +8.4 So11…1112

Backfill: 3 liquidity events (2 adds, 1 removes)
Net token flow into pools over this window (exact, from amountRaw):
  6p6x…iGPN  -509.8341
  So11…1112  -52.850021991

Streaming room liquidity:6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN — Ctrl+C to stop

[datastream] connected
14:02:13  LIVE ADD     pumpfun-amm  pool 9d9m…ZF4u  by Cw2L…p1Dd  +120.25 6p6x…iGPN  [provisional]
[reconcile:interval] confirmed 1, still provisional 0, expired 0
```

## Extend it

- Add a swap subscription (`subscribe.tx.token`) next to the liquidity room and render an All / Swaps / Liquidity feed; see https://www.solanatracker.io/resources/stream-solana-trades-websocket.
- Switch to `getUserPoolTradeHistory` and `subscribe.liquidity.tokenPoolWallet` to follow one liquidity provider in one pool.
- Persist confirmed rows with `amountRaw` as text or `NUMERIC` and replace the reconciled window instead of appending.
- Alert when a single removal exceeds a share of pool depth, using pool data from the token endpoint; see https://www.solanatracker.io/resources/check-solana-token-rug-risk-api.

## Links

- Tutorial: [Solana Liquidity Events API: LP History and Live Stream](https://www.solanatracker.io/resources/solana-liquidity-history-websocket)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
