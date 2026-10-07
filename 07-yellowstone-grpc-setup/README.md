# Yellowstone gRPC setup

Companion code for the guide [Yellowstone gRPC Tutorial: Connect, Filter, Reconnect](https://www.solanatracker.io/resources/yellowstone-grpc-setup).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Solana RPC](https://www.solanatracker.io/solana-rpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes)

## What it does

- Connects to Solana Tracker Yellowstone gRPC with an endpoint and `x-token`, answers server pings, and reconnects with capped exponential backoff and jitter.
- Sends one `SubscribeRequest` that combines slot updates, block metadata and a transaction filter on `WATCH_ADDRESS` (the Pump.fun program by default).
- Prints one row per block: slot, executed transaction count, how many transactions matched the filter, and a sample signature.
- Flags gaps when a block's parent is not the last block seen, and warns on slots marked dead.
- Sets the stream commitment from `COMMITMENT` through the `CommitmentLevel` enum and prints a summary on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Yellowstone gRPC subscription, or a plan that includes gRPC (Business or Professional shared RPC, or a dedicated node). The endpoint and token are in the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/07-yellowstone-grpc-setup
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
| `WATCH_ADDRESS` | No | Program or account for the transaction filter (default: Pump.fun program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`) |
| `COMMITMENT` | No | `processed`, `confirmed` or `finalized` (default `confirmed`) |

## Sample output

Illustrative values; real rows depend on network activity.

```text
Watching 6EF8rr…BEwF6P at confirmed commitment. Ctrl+C to stop.

time      slot         block txs  matched  sample signature
--------  -----------  ---------  -------  ----------------
[grpc] connected
14:02:11  412880101    1.4K       38       5Kq2x…9TzpA
14:02:11  412880102    1.2K       41       3vFhD…pQ7mW
  gap: block 412880105 has parent 412880104, last block seen was 412880102; backfill this range
14:02:13  412880105    1.5K       29       2Rk8J…aY1cN
^C
Stopped. blocks=3 matched=108 gaps=1 dead=0 tip=412880106
```

## Extend it

- Swap `WATCH_ADDRESS` for your own program and decode its instructions, as in the [Pump.fun gRPC guide](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens).
- Backfill reported gaps with `getBlock` over [Solana RPC](https://www.solanatracker.io/solana-rpc) before trusting per-block counts.
- Persist the last processed slot after each downstream write so a restart knows where to reconcile from.
- Parse swaps from the same stream with the [Raydium swap parser](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions) or the [Meteora DLMM parser](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing).

## Links

- Tutorial: [Yellowstone gRPC Tutorial: Connect, Filter, Reconnect](https://www.solanatracker.io/resources/yellowstone-grpc-setup)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Dedicated Nodes: [https://www.solanatracker.io/dedicated-nodes](https://www.solanatracker.io/dedicated-nodes)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
