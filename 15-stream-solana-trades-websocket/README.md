# Stream Solana trades over WebSocket

Companion code for the guide [Solana Trades WebSocket: Live Swaps Without Gaps](https://www.solanatracker.io/resources/stream-solana-trades-websocket).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Enterprise](https://www.solanatracker.io/enterprise)

## What it does

- Subscribes to the token transaction room (`subscribe.tx.token`) or one pool (`subscribe.tx.pool` when `POOL_ADDRESS` is set) and prints each buy and sell with USD and SOL volume, token amount, price, wallet, program and signature.
- Backfills the most recent trades with `getTokenTradeHistory` / `getPoolTradeHistory`, buffering live trades that arrive meanwhile and flushing them in time order.
- Dedupes REST and live rows with a trade key (signature, wallet, side, amount), because one signature can hold several swaps and the same trade can arrive from both sources.
- After every reconnect, walks REST history back with `nextCursor` until it overlaps what was already shown and prints only the trades missed while disconnected.
- Optional `ENRICHED=true` joins the `:enriched` room and requests `enrich: 'identity'` on REST to show wallet labels.
- Prints rolling stats (buys, sells, unique wallets, duplicates, late arrivals) and a net-flow summary on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker plan with Datastream access (Premium or higher) for `ST_DATASTREAM_KEY`.
- A Data API key for the backfill and gap fill.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/15-stream-solana-trades-websocket
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=15-stream-solana-trades-websocket%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_DATASTREAM_KEY` | Yes | Datastream key or the full `wss://datastream.solanatracker.io/<key>` URL. Never logged. |
| `ST_API_KEY` | Yes | Data API key used for REST history. |
| `TOKEN_MINT` | No | Token to stream. Defaults to the docs example token. |
| `POOL_ADDRESS` | No | Limit the stream and history to one pool. |
| `MIN_USD` | No | Minimum USD volume to print (default 0). |
| `BACKFILL` | No | Trades per REST page, 1-500 (default 25). |
| `ENRICHED` | No | `true` adds wallet identity labels (default `false`). |
| `STATS_SECONDS` | No | Seconds between stats lines (default 30). |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the token and current activity.

```text
Room transaction:6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN. Ctrl+C to stop.

Backfill: last 25 trade(s) from REST

14:01:10  SELL      $540.00     3.000 SOL       90  @ $6.00         F7R6…8EMi  pumpfun-amm   5V4apV…WSFpnvW  rest
14:01:25  BUY       $118.40     0.660 SOL    19.72  @ $6.00         9WzD…AWWM  pumpfun-amm   3kTq9e…Lm2sPxQ  rest

Live:

[datastream] connected
14:02:03  BUY     $1,204.10     6.710 SOL      200  @ $6.02         4Nd1…9qRt  pumpfun-amm   2Hx7Ka…Zp4vNcE  live
[datastream] disconnected (transaction)
[datastream] reconnecting, attempt 1
[datastream] connected
[rest] reconnect gap fill: 3 trade(s) missed while disconnected
14:02:41  SELL       $64.20     0.358 SOL    10.68  @ $6.01         7Yhs…Kd3M  pumpfun-amm   4pQe1W…Ty8bJdA  gap
[stats] 14 buys $9.8K | 11 sells $6.1K | 19 wallets | 4 dupes dropped | 0 late | 2s since last message

Stopped. 25 trade(s) shown, net flow +$3.7K, 4 duplicate(s) dropped, 0 below MIN_USD.
```

## Extend it

- Swap the room for `subscribe.tx.whale(5000)` to follow large trades across all tokens instead of one token.
- Fold trades into your own live candle between chart refreshes; see https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api.
- Add LP events to the same feed with the liquidity rooms; see https://www.solanatracker.io/resources/solana-liquidity-history-websocket.
- Look up wallets that trade repeatedly with the identity endpoints; see https://www.solanatracker.io/resources/solana-wallet-identity-enrichment.

## Links

- Tutorial: [Solana Trades WebSocket: Live Swaps Without Gaps](https://www.solanatracker.io/resources/stream-solana-trades-websocket)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Enterprise: [https://www.solanatracker.io/enterprise](https://www.solanatracker.io/enterprise)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
