# Jupiter DCA orders: REST snapshot + live events

Companion code for the guide [Jupiter DCA API: Track Recurring Orders and Live Fills](https://www.solanatracker.io/resources/jupiter-dca-api-recurring-orders).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc)

## What it does

- Prints the DCA flow overview for a token (`getDcaTokenFlow`): buy-side and sell-side order counts and reported USD volume.
- Lists recurring orders buying the token (token as output) and selling it (token as input) with `getDcaTokenBuyers` / `getDcaTokenSellers`, following `pagination.nextCursor` with the same status, sort and program on every page.
- Optionally summarises one owner wallet with `getDcaWallet` (status counts plus orders).
- Streams the token's buyer and seller rooms over Datastream, printing fills, opens, closes, deposits, withdrawals and fees, deduplicated by signature, event index and event name.
- Applies position snapshots as state updates (newest slot and `writeVersion` wins), never as fills, and re-reads order state from REST after every reconnect.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key for the REST snapshot.
- Optional: Datastream access (Premium plan or higher) for the live part.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/18-jupiter-dca-api-recurring-orders
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=18-jupiter-dca-api-recurring-orders%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `ST_DATASTREAM_KEY` | No | Datastream key or full `wss://` URL. Without it, only the REST snapshot runs. |
| `TOKEN_MINT` | No | Token mint to analyse. Defaults to wrapped SOL. |
| `WALLET_ADDRESS` | No | Owner wallet to summarise with its DCA orders. |
| `SIDE` | No | `buyers`, `sellers` or `both` (default `both`). |
| `STATUS` | No | `active`, `paused`, `completed`, `pending` or `all` (default `active`). |
| `SORT` | No | `volume`, `deposited`, `remaining`, `progress`, `recent`, `created` or `status` (default `volume`). |
| `PAGE_LIMIT` | No | Orders per page, 1-1000 (default 100). |
| `MAX_PAGES` | No | Pages to read per side, 1-10 (default 2). |

## Sample output

Illustrative values; your output depends on the token and current activity.

```text
DCA flow for So11…1112 (Jupiter recurring orders)
  Buyers:  1284 orders, volume $3,912,440.18
  Sellers: 902 orders, volume $2,175,903.62

100 of 611 active orders buying So11…1112 (sorted by volume)

Owner      Pair         Status  Per cycle  Every  Done  Remaining  Next
---------  -----------  ------  ---------  -----  ----  ---------  ------
7Yhs…Kd3M  USDC → SOL   active  500 USDC   1h     41%   29.5K USDC in 22m
Cw2L…p1Dd  USDT → SOL   active  250 USDT   4h     12%   22K USDT   in 3h
4kQn…8sTa  USDC → SOL   active  25 USDC    1h     87%   1.3K USDC  due
… 85 more not shown
Remaining input on loaded orders: $1.42M across 100 priced orders

Streaming dca:jupiter:So11111111111111111111111111111111111111112:buyers and dca:jupiter:So11111111111111111111111111111111111111112:sellers — Ctrl+C to stop

[datastream] connected
14:02:13  buyers   FILLED   25 USDC → 0.168204 SOL ($25.00)  owner 4kQn…8sTa  tx 5Zq8Lm…r2KdPw
14:02:40  sellers  OPENED   2 SOL every 1d, deposited $1,490.12 (openDcaV2)  owner 9d9m…ZF4u  tx 3HkN7a…aQ2eXv
14:03:05  buyers   STATUS   Dw1x…Pq7c active → completed
[state] 1714 orders tracked, 37 position snapshots applied
```

## Extend it

- Subscribe to `subscribe.dca.wallet(address)` or `subscribe.dca.order(address)` to follow one owner or one DCA account instead of a whole token.
- Use `getDcaPair(inputMint, outputMint)` to compare buy-side and sell-side orders for one exact pair, such as USDC into a token versus the token into USDC.
- Persist fills keyed by signature, event index and event name, and keep order state in a separate table updated by position snapshots.
- Add `getDcaTokenUsers` to rank the wallets with the most DCA activity on the token.
- Join fills with on-chain swaps from the trade stream; see https://www.solanatracker.io/resources/stream-solana-trades-websocket.

## Links

- Tutorial: [Jupiter DCA API: Track Recurring Orders and Live Fills](https://www.solanatracker.io/resources/jupiter-dca-api-recurring-orders)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
