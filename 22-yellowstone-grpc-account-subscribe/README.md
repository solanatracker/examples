# Stream a wallet's SOL and token balances over gRPC

Companion code for the guide [Yellowstone gRPC Account Subscribe: Stream Token Balances](https://www.solanatracker.io/resources/yellowstone-grpc-account-subscribe).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Solana RPC](https://www.solanatracker.io/solana-rpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes)

## What it does

- Streams one wallet's SOL balance and every SPL Token and Token-2022 account it owns through Yellowstone gRPC account filters (`owner` + `memcmp` at byte 32, `datasize` 165 for classic SPL, `tokenAccountState` for Token-2022).
- Decodes mint, owner and amount straight from the account bytes, and prints one row per balance change with the signed delta and the transaction signature.
- Drops stale or duplicate updates by comparing `slot` and `writeVersion`.
- Adds every token account it learns about to an explicit `account` filter (one debounced filter update), so it also sees accounts being closed.
- With `SOLANA_RPC_URL` set: takes a starting snapshot with `getBalance` and `getTokenAccountsByOwner`, re-runs it after every reconnect to backfill missed changes, and reads mint decimals.
- Answers server pings, reconnects with capped exponential backoff and jitter, and prints a summary on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Yellowstone gRPC subscription, or a plan that includes gRPC (Business or Professional shared RPC, or a dedicated node). The endpoint and token are in the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).
- Optional: a Solana RPC URL for snapshots and decimals, for example from the [RPC dashboard](https://www.solanatracker.io/account/shared-rpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/22-yellowstone-grpc-account-subscribe
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
| `WALLET_ADDRESS` | No | Wallet to watch (default `FbMxP3GVq8TQ36nbYgx4NP9iygMpwAwFWJwW81ioCiSF`) |
| `SOLANA_RPC_URL` | No | Enables the starting snapshot, reconnect backfill and mint decimals. Without it, new mints print raw base units |
| `COMMITMENT` | No | `processed`, `confirmed` or `finalized` (default `confirmed`); also used for the RPC snapshot |

## Sample output

Illustrative values; real rows depend on the wallet's activity.

```text
Watching FbMxP3…ioCiSF (SOL, SPL Token, Token-2022) at confirmed commitment. Ctrl+C to stop.

time      slot         event     asset  mint         balance               change                signature
--------  -----------  --------  -----  -----------  --------------------  --------------------  -------------
[grpc] connected
[rpc] snapshot: 12.48 SOL, 30 SPL + 41 Token-2022 accounts at slot 454194757
14:02:11  454194790    change    SOL                 12.475995             -0.004005             5Kq2x…9TzpA
14:02:11  454194790    change    SPL    EPjF…Dt1v    1,250.5               +250                  5Kq2x…9TzpA
14:02:19  454194811    seen      T22    2zMM…pump    1,840,221.33                                3vFhD…pQ7mW
14:03:02  454194920    closed    SPL    7GCi…W2hr    0                     -0.5                  2Rk8J…aY1cN
^C
Stopped. updates=9 changes=2 backfilled=0 discovered=1 closed=1 stale=0 token accounts=71
```

## Extend it

- Watch several wallets: add one named `spl`/`token2022` filter pair per wallet; each update's `filters` array names the match.
- Price every change in USD with the [Solana token price API](https://www.solanatracker.io/resources/get-solana-token-price-api), or show full holdings with the [wallet portfolio API](https://www.solanatracker.io/resources/solana-wallet-portfolio-api).
- Track a pool or program state account instead: point the `account` filter at it and decode its layout.
- Persist the last applied `slot` per account so a restart only backfills what changed.
- Start from the [Yellowstone gRPC tutorial](https://www.solanatracker.io/resources/yellowstone-grpc-setup) for transaction and block streams.

## Links

- Tutorial: [Yellowstone gRPC Account Subscribe: Stream Token Balances](https://www.solanatracker.io/resources/yellowstone-grpc-account-subscribe)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Dedicated Nodes: [https://www.solanatracker.io/dedicated-nodes](https://www.solanatracker.io/dedicated-nodes)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
