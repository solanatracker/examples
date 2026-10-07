# Stream new Pump.fun mints over gRPC

Companion code for the guide [Pump.fun gRPC: Stream and Decode New Token Mints](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Pump.fun API](https://www.solanatracker.io/pumpfun-api)

## What it does

- Subscribes to Yellowstone gRPC transactions that include the Pump.fun program and the Pump.fun mint-authority PDA, so buys and sells are dropped on the server.
- Decodes `create` and `create_v2` instructions with Anchor's `BorshInstructionCoder` and the bundled `idl/pumpfun.json`, including creates routed through other programs.
- Prints mint, name, symbol, creator and instruction version for each new token, with name and symbol stripped of control characters.
- Skips failed transactions and deduplicates by signature and instruction path across reconnects.
- Answers server pings, reconnects with backoff, and exits cleanly on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Yellowstone gRPC subscription, or a plan that includes gRPC (Business or Professional shared RPC, or a dedicated node). The endpoint and token are in the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/08-pumpfun-stream-new-minted-tokens
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

This example uses a native gRPC client, so it needs a local Node.js runtime (no browser sandboxes).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `YELLOWSTONE_GRPC_ENDPOINT` | Yes | `https://grpc.solanatracker.io` (EU) or `https://grpc-us.solanatracker.io` (US) |
| `YELLOWSTONE_GRPC_TOKEN` | Yes | gRPC token, sent as the `x-token` header |
| `COMMITMENT` | No | `processed`, `confirmed` or `finalized` (default `processed`) |

## Sample output

Illustrative values; real rows depend on live launches.

```text
Streaming Pump.fun creates at processed commitment. Ctrl+C to stop.

time      slot       ver  mint                                          symbol      name                      creator      via
--------  ---------  ---  --------------------------------------------  ----------  ------------------------  -----------  -----------
[grpc] connected
14:20:05  412881977  v2   7Xq3mExampLeMintAddressxxxxxxxxxxxxxxxxxpump  DEMO        Demo Token                9pQr…Lk2a    direct
14:20:06  412881979  v2   4HnbSamPLeMintAddressyyyyyyyyyyyyyyyyyyypump  SAMPLE      Sample Coin               3vXt…Wm8c    FAdo…2Kq7
^C
Stopped after 2 new mint(s).
```

## Extend it

- Fetch each token's metadata `uri` through a worker with timeouts and size limits, never from the stream handler.
- Watch the same mints for curve progress and migration with the [Pump.fun graduation guide](https://www.solanatracker.io/resources/detect-pumpfun-graduation).
- Pull the earliest buyers of each launch with the [Pump.fun first buyers guide](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api).
- Compare against indexed launch objects from the [Pump.fun WebSocket API](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket) when you need price, liquidity and risk without decoding.

## Links

- Tutorial: [Pump.fun gRPC: Stream and Decode New Token Mints](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
