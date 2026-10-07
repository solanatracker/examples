# Parse Raydium AMM v4 swaps from gRPC

Companion code for the guide [Parse Raydium Swaps from a Yellowstone gRPC Stream](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes)

## What it does

- Streams confirmed transactions that include the Raydium AMM v4 program, or one pool when `POOL_ADDRESS` is set (pool plus program required).
- Walks top-level and inner instructions in execution order, so swaps routed through aggregators are found as well as direct calls.
- Recognizes `swapBaseIn` (tag 9), `swapBaseOut` (tag 11) and the 8-account `swapBaseInV2` (16) and `swapBaseOutV2` (17) forms that skip the OpenBook accounts.
- Measures the fill from the pool vault token-balance deltas (accounts owned by the AMM authority), not from the slippage limits in the instruction data.
- Prints sold and bought amounts, the SOL price when one side is wrapped SOL, the calling program, and marks net rows when one transaction swaps the same pool more than once.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Yellowstone gRPC subscription, or a plan that includes gRPC (Business or Professional shared RPC, or a dedicated node). The endpoint and token are in the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/09-raydium-stream-and-parse-amm-transactions
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
| `POOL_ADDRESS` | No | AMM v4 pool (amm id) to follow; empty parses every AMM v4 swap |
| `COMMITMENT` | No | `processed`, `confirmed` or `finalized` (default `confirmed`) |

## Sample output

Illustrative values; real rows depend on live trading.

```text
Parsing Raydium AMM v4 swaps at confirmed commitment. Ctrl+C to stop.

time      slot       pool         sold                      bought                    SOL/token     via          signature
--------  ---------  -----------  ------------------------  ------------------------  ------------  -----------  -----------
[grpc] connected
14:31:02  412883410  58oQ…YQo2    1.81 USDC                 0.0152 SOL                0.008430      JUP6…TaV4    4aKL…LXwJ
14:31:02  412883411  7Hx2…Pq9d    0.5 SOL                   18,204.33 9Kq1…pump       0.00002747    direct       2mVb…8sQe
14:31:03  412883413  7Hx2…Pq9d    9,102.1 9Kq1…pump (net)   0.2491 SOL (net)          0.00002737    6Vo3…uTAB    5yTr…aa3K
^C
Stopped. candidates=412 with-swap=3 swaps=3 unattributed=0
```

## Extend it

- Store each swap keyed by `signature` and instruction path, and reconcile confirmed rows against finalized ones before reporting volume.
- Build candles from the vault deltas, or compare with the indexed [Solana trades WebSocket](https://www.solanatracker.io/resources/stream-solana-trades-websocket).
- Add the Meteora DLMM decoder from the [DLMM swap parsing guide](https://www.solanatracker.io/resources/meteora-dlmm-transaction-parsing) to cover routes that split across venues.
- Filter `feePayer` against a watchlist to follow specific traders.

## Links

- Tutorial: [Parse Raydium Swaps from a Yellowstone gRPC Stream](https://www.solanatracker.io/resources/raydium-stream-and-parse-amm-transactions)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Dedicated Nodes: [https://www.solanatracker.io/dedicated-nodes](https://www.solanatracker.io/dedicated-nodes)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
