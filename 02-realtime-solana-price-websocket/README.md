# Stream Solana token prices over WebSocket

Companion code for the guide [Solana Price WebSocket: Aggregated and Pool Rooms](https://www.solanatracker.io/resources/realtime-solana-price-websocket).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Raptor Swap API](https://www.solanatracker.io/raptor)

## What it does

- Subscribes to the aggregated price room for `TOKEN_MINT` with `subscribe.price.aggregated` and prints median, primary-pool price, pool count and the min-max range across pools.
- Optionally subscribes to one pool's price room with `subscribe.price.pool` when `POOL_ADDRESS` is set.
- Fetches a REST `getPrice` snapshot on every `connected` event (first connect and each reconnect) and keeps whichever value has the newer server timestamp.
- Leaves reconnects to the SDK (capped exponential backoff with jitter; rooms are rejoined automatically) and only reports them.
- Runs a watchdog that refreshes over REST when no price message arrives for `STALE_AFTER_SECONDS`, and throttles output to one line per series per interval.
- Unsubscribes, disconnects and prints a short summary on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker plan with Datastream access (Premium or higher) for `ST_DATASTREAM_KEY`.
- A Data API key for the REST snapshot.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/02-realtime-solana-price-websocket
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=02-realtime-solana-price-websocket%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_DATASTREAM_KEY` | Yes | Datastream key or the full `wss://datastream.solanatracker.io/<key>` URL. Never logged. |
| `ST_API_KEY` | Yes | Data API key used for the REST snapshot. |
| `TOKEN_MINT` | No | Token to stream. Defaults to wrapped SOL. |
| `POOL_ADDRESS` | No | Also stream this pool's price room. |
| `STALE_AFTER_SECONDS` | No | Seconds of silence before a REST refresh (default 30). |
| `PRINT_INTERVAL_MS` | No | Minimum milliseconds between printed lines per series (default 1000). |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; real output depends on the token and market activity.

```text
Streaming price:aggregated:So11111111111111111111111111111111111111112. Ctrl+C to stop.

[datastream] connected
14:02:10  rest    median $150.12       primary $150.12       liquidity $29.45M
14:02:11  stream  median $150.14       primary $150.13       37 pools, range $149.93 to $150.28 +0.23%
14:02:12  stream  median $150.18       primary $150.19       37 pools, range $149.97 to $150.31 +0.22%
[datastream] disconnected (main)
[datastream] reconnecting, attempt 1
[datastream] connected
[rest] reconnect snapshot is older than the last streamed value; keeping the stream value
14:02:16  stream  median $150.21       primary $150.20       37 pools, range $150.01 to $150.36 +0.23%

Stopped. 58 aggregated update(s), 1 out-of-order value(s) dropped, last $150.21.
```

## Extend it

- Add the trade feed for the same token to explain each price move; see https://www.solanatracker.io/resources/stream-solana-trades-websocket.
- Seed a chart with historical candles before you start streaming; see https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api.
- Use `topPools` from the aggregated payload to alert when the primary pool drifts from the median by more than a threshold.
- Stream a watchlist by subscribing to several aggregated rooms on one client and keying state by `token`.

## Links

- Tutorial: [Solana Price WebSocket: Aggregated and Pool Rooms](https://www.solanatracker.io/resources/realtime-solana-price-websocket)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Raptor Swap API: [https://www.solanatracker.io/raptor](https://www.solanatracker.io/raptor)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
