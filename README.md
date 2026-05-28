# Solana Tracker Examples

Runnable code for every guide at [solanatracker.io/resources](https://www.solanatracker.io/resources).

All examples live in one repository: [github.com/solanatracker/examples](https://github.com/solanatracker/examples)

| Folder | Example | Tutorial |
|--------|---------|----------|
| 01-get-solana-token-price-api | [Get Solana token prices (REST)](https://github.com/solanatracker/examples/tree/main/01-get-solana-token-price-api) | [Tutorial](https://www.solanatracker.io/resources/get-solana-token-price-api) |
| 02-realtime-solana-price-websocket | [Stream live Solana prices (WebSocket)](https://github.com/solanatracker/examples/tree/main/02-realtime-solana-price-websocket) | [Tutorial](https://www.solanatracker.io/resources/realtime-solana-price-websocket) |
| 03-solana-wallet-portfolio-api | [Wallet portfolio and PnL v2](https://github.com/solanatracker/examples/tree/main/03-solana-wallet-portfolio-api) | [Tutorial](https://www.solanatracker.io/resources/solana-wallet-portfolio-api) |
| 04-stream-pumpfun-launches-websocket | [Stream Pump.fun launches (WebSocket)](https://github.com/solanatracker/examples/tree/main/04-stream-pumpfun-launches-websocket) | [Tutorial](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket) |
| 05-detect-pumpfun-graduation | [Detect Pump.fun graduations](https://github.com/solanatracker/examples/tree/main/05-detect-pumpfun-graduation) | [Tutorial](https://www.solanatracker.io/resources/detect-pumpfun-graduation) |
| 06-reduce-solana-rpc-latency | [Reduce Solana RPC latency](https://github.com/solanatracker/examples/tree/main/06-reduce-solana-rpc-latency) | [Tutorial](https://www.solanatracker.io/resources/reduce-solana-rpc-latency) |
| 07-yellowstone-grpc-setup | [Yellowstone gRPC setup](https://github.com/solanatracker/examples/tree/main/07-yellowstone-grpc-setup) | [Tutorial](https://www.solanatracker.io/resources/yellowstone-grpc-setup) |
| 08-pumpfun-stream-new-minted-tokens | [Stream Pump.fun mints (gRPC)](https://github.com/solanatracker/examples/tree/main/08-pumpfun-stream-new-minted-tokens) | [Tutorial](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens) |
| 09-raydium-stream-and-parse-amm-transactions | [Parse Raydium AMM swaps (gRPC)](https://github.com/solanatracker/examples/tree/main/09-raydium-stream-and-parse-amm-transactions) | [Tutorial](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions) |
| 10-meteora-dlmm-transaction-parsing | [Parse Meteora DLMM swaps (gRPC)](https://github.com/solanatracker/examples/tree/main/10-meteora-dlmm-transaction-parsing) | [Tutorial](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing) |

## Quick start

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/01-get-solana-token-price-api
cp .env.example .env
npm install
npm start
```

## Environment variables

| Variable | Used by | Where to get it |
|----------|---------|-----------------|
| `ST_API_KEY` | REST Data API examples | [Data API dashboard](https://www.solanatracker.io/account/data-api) |
| `ST_DATASTREAM_KEY` | WebSocket Datastream examples | Data API dashboard → **Datastream** section |
| `YELLOWSTONE_GRPC_ENDPOINT` | gRPC examples | [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc) |
| `YELLOWSTONE_GRPC_TOKEN` | gRPC examples | Same dashboard (`x-token` value) |
| `WALLET_ADDRESS` | Wallet portfolio example | Any Solana wallet pubkey |
| `DEDICATED_RPC_URL` | RPC latency example | [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes) |

## Regenerate from site content

From the main Solana Tracker repo:

```bash
node scripts/sync-resource-examples.mjs
npm run validate:resources
npm run run:resources
```
