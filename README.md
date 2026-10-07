# Solana Tracker Examples

Runnable TypeScript projects for the guides at [solanatracker.io/resources](https://www.solanatracker.io/resources). Each folder is a standalone Node.js project with its own `package.json`, `.env.example`, and README.

## Quick start

Requires Node.js 20.18 or later (24 LTS recommended).

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/01-get-solana-token-price-api
cp .env.example .env   # add ST_API_KEY
npm install
npm start
```

Every example validates its environment on startup and exits with a one-line message naming any missing variable. Streaming examples reconnect with capped exponential backoff and stop cleanly on Ctrl+C. `npm run typecheck` type-checks a project without running it.

## Learning path

1. [01-get-solana-token-price-api](01-get-solana-token-price-api): make a REST call, handle errors and retries.
2. [02-realtime-solana-price-websocket](02-realtime-solana-price-websocket): subscribe to a Datastream room with automatic reconnect.
3. [04-stream-pumpfun-launches-websocket](04-stream-pumpfun-launches-websocket): consume a high-volume launch feed.
4. [07-yellowstone-grpc-setup](07-yellowstone-grpc-setup): open a Yellowstone gRPC stream and answer pings.
5. [09-raydium-stream-and-parse-amm-transactions](09-raydium-stream-and-parse-amm-transactions): decode program instructions from raw transactions.

## Examples by product

### Data API: REST

Request/response data with an `ST_API_KEY`. Start here. Product: [Solana Data API](https://www.solanatracker.io/data-api).

| Folder | Example | Tutorial |
|--------|---------|----------|
| [01-get-solana-token-price-api](01-get-solana-token-price-api) | Solana token prices per pool and in batches | [Guide](https://www.solanatracker.io/resources/get-solana-token-price-api) |
| [11-solana-token-ohlcv-chart-api](11-solana-token-ohlcv-chart-api) | Solana OHLCV candles with gap handling | [Guide](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api) |
| [12-check-solana-token-rug-risk-api](12-check-solana-token-rug-risk-api) | Token rug check and risk score | [Guide](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api) |
| [14-solana-token-search-screener-api](14-solana-token-search-screener-api) | Token screener with Search API | [Guide](https://www.solanatracker.io/resources/solana-token-search-screener-api) |
| [03-solana-wallet-portfolio-api](03-solana-wallet-portfolio-api) | Wallet portfolio and PnL v2 | [Guide](https://www.solanatracker.io/resources/solana-wallet-portfolio-api) |
| [16-solana-pnl-leaderboard-api](16-solana-pnl-leaderboard-api) | PnL v2 trader leaderboard | [Guide](https://www.solanatracker.io/resources/solana-pnl-leaderboard-api) |

### Data API: Datastream (WebSocket)

Live rooms over WebSocket. Needs `ST_DATASTREAM_KEY` (Premium plan or higher). Product: [Solana Data API](https://www.solanatracker.io/data-api).

| Folder | Example | Tutorial |
|--------|---------|----------|
| [02-realtime-solana-price-websocket](02-realtime-solana-price-websocket) | Stream Solana token prices over WebSocket | [Guide](https://www.solanatracker.io/resources/realtime-solana-price-websocket) |
| [15-stream-solana-trades-websocket](15-stream-solana-trades-websocket) | Stream Solana trades over WebSocket | [Guide](https://www.solanatracker.io/resources/stream-solana-trades-websocket) |

### Pump.fun API

Launches, bonding curves, graduations, and early buyers. Same Data API keys. Product: [Pump.fun API](https://www.solanatracker.io/pumpfun-api).

| Folder | Example | Tutorial |
|--------|---------|----------|
| [04-stream-pumpfun-launches-websocket](04-stream-pumpfun-launches-websocket) | Stream Pump.fun launches (WebSocket) | [Guide](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket) |
| [05-detect-pumpfun-graduation](05-detect-pumpfun-graduation) | Detect Pump.fun graduations | [Guide](https://www.solanatracker.io/resources/detect-pumpfun-graduation) |
| [13-pumpfun-first-buyers-sniper-api](13-pumpfun-first-buyers-sniper-api) | Pump.fun first buyers and snipers | [Guide](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api) |

### Yellowstone gRPC

Raw on-chain streams decoded in your own process. Needs a gRPC endpoint and token. Product: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc).

| Folder | Example | Tutorial |
|--------|---------|----------|
| [07-yellowstone-grpc-setup](07-yellowstone-grpc-setup) | Yellowstone gRPC setup | [Guide](https://www.solanatracker.io/resources/yellowstone-grpc-setup) |
| [08-pumpfun-stream-new-minted-tokens](08-pumpfun-stream-new-minted-tokens) | Stream Pump.fun mints (gRPC) | [Guide](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens) |
| [09-raydium-stream-and-parse-amm-transactions](09-raydium-stream-and-parse-amm-transactions) | Parse Raydium AMM swaps (gRPC) | [Guide](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions) |
| [10-meteora-dlmm-transaction-parsing](10-meteora-dlmm-transaction-parsing) | Parse Meteora DLMM swaps (gRPC) | [Guide](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing) |

### Solana RPC

Measure and compare RPC endpoints. Product: [Solana RPC](https://www.solanatracker.io/solana-rpc).

| Folder | Example | Tutorial |
|--------|---------|----------|
| [06-reduce-solana-rpc-latency](06-reduce-solana-rpc-latency) | Solana RPC latency benchmark | [Guide](https://www.solanatracker.io/resources/reduce-solana-rpc-latency) |

## Environment variables

Copy `.env.example` to `.env` in the folder you are running. Never commit `.env`.

| Variable | Used by | Description |
|----------|---------|-------------|
| `RPC_URLS` | 06 | Comma-separated RPC URLs to compare |
| `SOLANA_RPC_URL` | 06 | RPC URL including `?api_key=` from the [RPC dashboard](https://www.solanatracker.io/account/shared-rpc) |
| `ST_API_KEY` | 01, 02, 03, 05, 11, 12, 13, 14, 15, 16 | Data API key from the [Data API dashboard](https://www.solanatracker.io/account/data-api) |
| `ST_DATASTREAM_KEY` | 02, 03, 04, 05, 13, 15 | Datastream key or full `wss://` URL from the Data API dashboard (Premium plan or higher) |
| `YELLOWSTONE_GRPC_ENDPOINT` | 07, 08, 09, 10 | gRPC endpoint from the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc) |
| `YELLOWSTONE_GRPC_TOKEN` | 07, 08, 09, 10 | `x-token` from the same dashboard |
| `BACKFILL` | 15 | Example input; see that folder's `.env.example` |
| `CHART_CURRENCY` | 11 | Example input; see that folder's `.env.example` |
| `CHART_DAYS` | 11 | Example input; see that folder's `.env.example` |
| `CHART_INTERVAL` | 11 | Example input; see that folder's `.env.example` |
| `COMMITMENT` | 06 | Example input; see that folder's `.env.example` |
| `DATA_API_BASE_URL` | 01, 02, 11, 15 | Example input; see that folder's `.env.example` |
| `ENRICHED` | 15 | Example input; see that folder's `.env.example` |
| `FILL_GAPS` | 11 | Example input; see that folder's `.env.example` |
| `INTERVAL_MS` | 06 | Example input; see that folder's `.env.example` |
| `LEADERBOARD_DAYS` | 16 | Example input; see that folder's `.env.example` |
| `MARKET_CAP` | 11 | Example input; see that folder's `.env.example` |
| `MAX_RISK_SCORE` | 12 | Example input; see that folder's `.env.example` |
| `MIN_USD` | 15 | Example input; see that folder's `.env.example` |
| `POOL_ADDRESS` | 02, 11, 15 | Example input; see that folder's `.env.example` |
| `PRINT_INTERVAL_MS` | 02 | Example input; see that folder's `.env.example` |
| `SAMPLES` | 06 | Example input; see that folder's `.env.example` |
| `SHOW_LAST` | 11 | Example input; see that folder's `.env.example` |
| `STALE_AFTER_SECONDS` | 02 | Example input; see that folder's `.env.example` |
| `STATS_SECONDS` | 15 | Example input; see that folder's `.env.example` |
| `STREAM_SNIPERS` | 13 | Example input; see that folder's `.env.example` |
| `TIMEOUT_MS` | 06 | Example input; see that folder's `.env.example` |
| `TOKEN_MINT` | 01, 02, 11, 12, 13, 15 | Example input; see that folder's `.env.example` |
| `WALLET_ADDRESS` | 03 | Example input; see that folder's `.env.example` |
| `WATCHLIST` | 01 | Example input; see that folder's `.env.example` |
| `WINDOW_CANDLES` | 11 | Example input; see that folder's `.env.example` |

## Shared helpers

Kit-based examples include the same small helpers in `src/`:

- `env.ts`: loads `.env` and validates required variables.
- `client.ts`: Data API client with per-request timeout and capped exponential retry that respects `Retry-After`.
- `datastream.ts`: Datastream client with reconnect backoff and Ctrl+C shutdown.
- `grpc.ts`: Yellowstone gRPC stream with ping replies, reconnect backoff, and full request replay.
- `format.ts`: number, address, and table formatting.

## Links

- [Guides](https://www.solanatracker.io/resources)
- [Documentation](https://docs.solanatracker.io)
- [Solana Data API](https://www.solanatracker.io/data-api) · [Pump.fun API](https://www.solanatracker.io/pumpfun-api) · [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Solana RPC](https://www.solanatracker.io/solana-rpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes) · [Raptor](https://www.solanatracker.io/raptor)

## Contributing

These folders are generated from the Solana Tracker site repository (`scripts/sync-resource-examples.mjs`). Direct edits here are overwritten on the next sync.
