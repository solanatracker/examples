# Parse Meteora DLMM swaps from gRPC

Companion code for the guide [Meteora DLMM Swap Parsing with Yellowstone gRPC](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes)

## What it does

- Streams confirmed transactions that include the Meteora DLMM program, or one LB pair when `POOL_ADDRESS` is set (pair plus program required).
- Identifies `swap`, `swap2`, `swapExactOut` and `swapWithPriceImpact` by their Anchor sighash discriminators, computed from the bundled `idl/meteora-dlmm.json`.
- Reads executed amounts, fees and the start and end bin from the Swap event the program emits as a self-CPI, and falls back to reserve balance deltas when no event is found.
- Finds swaps at any depth, including the common case of a DLMM swap routed through an aggregator.
- Prints the bin range for each swap, the fill source, the calling program and a summary on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Yellowstone gRPC subscription, or a plan that includes gRPC (Business or Professional shared RPC, or a dedicated node). The endpoint and token are in the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/10-meteora-dlmm-transaction-parsing
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
| `POOL_ADDRESS` | No | DLMM LB pair address to follow; empty parses every DLMM swap |
| `COMMITMENT` | No | `processed`, `confirmed` or `finalized` (default `confirmed`) |

## Sample output

Illustrative values; real rows depend on live trading.

```text
Parsing Meteora DLMM swaps at confirmed commitment. Ctrl+C to stop.

time      slot       lb pair      kind           in                      out                     bins           fill      via          signature
--------  ---------  -----------  -------------  ----------------------  ----------------------  -------------  --------  -----------  -----------
[grpc] connected
14:40:10  412884920  5omz…YTpb    swap2          0.0018 SOL              149.7869 9aqm…aqjj      -224→-223      event     JUP6…TaV4    2q6J…tiKL
14:40:10  412884921  2QxY…Rw7D    swap2          7,899.2572 7Ver…pump    0.5134 SOL              -547           event     direct       4Qbg…Da1o
^C
Stopped. candidates=318 swaps=2 event=2 reserves=0 unfilled=0
```

## Extend it

- Read `binStep` from the LbPair account and convert each bin ID to a price with `(1 + binStep / 10000) ^ binId`, adjusted for decimals.
- Track the active bin per pair from `endBinId` to see liquidity being crossed in real time.
- Combine with the [Raydium swap parser](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions) to follow aggregator routes that split across venues.
- Start from the [Yellowstone gRPC tutorial](https://www.solanatracker.io/resources/yellowstone-grpc-setup) for gap detection with block metadata.

## Links

- Tutorial: [Meteora DLMM Swap Parsing with Yellowstone gRPC](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Dedicated Nodes: [https://www.solanatracker.io/dedicated-nodes](https://www.solanatracker.io/dedicated-nodes)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
