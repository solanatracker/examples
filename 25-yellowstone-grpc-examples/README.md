# Yellowstone gRPC cookbook: one decoder, many DeFi recipes

Companion code for the guide [Yellowstone gRPC Examples: 18 TypeScript Recipes for Solana](https://www.solanatracker.io/resources/yellowstone-grpc-examples).

Products: [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

Eighteen Yellowstone gRPC recipes on one shared core. One connection helper (`src/lib/grpc.ts`) handles pings, reconnects and filter updates. One transaction parser (`src/lib/tx.ts`, `src/lib/parsed.ts`) flattens instructions into a call tree, reads token balance changes and transfers, and extracts Anchor events. Thirteen protocol decoders (`src/protocols/`) turn instructions and events into swaps, new pools, launches and migrations, using each program's IDL from `idl/` and a small borsh decoder (`src/lib/idl.ts`). No Anchor dependency.

Run a recipe with `npm start -- <recipe> [args]`. `npm start` on its own lists them all.

| Group | Recipe | What it streams |
|-------|--------|-----------------|
| Connection | `slots [seconds]` | Every slot status change, from first shred to finalized or dead; with a duration it closes cleanly |
| | `latency [venues]` | Gap between the server producing an update (`createdAt`) and your process receiving it, as percentiles |
| | `reconnect [venues]` | Resumes from the last seen slot after a drop, skipping duplicates |
| | `filters [venues]` | Changes the subscription on the live stream: type `+venue` or `-venue` |
| Transactions | `transactions <address,...>` | Every transaction touching the given accounts |
| | `token <mint>` | Balance changes for one token, per wallet |
| Trades | `trades [venues]` | Every swap on the chosen venues, decoded into side, amounts and price |
| | `wallet <wallet,...>` | Swaps signed by specific wallets: the core of a copy-trading bot |
| | `pool <pool,...>` | Swaps against specific pools or bonding curves |
| | `price <mint>` | Every fill for one token with its execution price |
| | `top [venues]` | Most traded tokens over a rolling 60-second window |
| Lifecycle | `pools [venues]` | New liquidity pools |
| | `launches [venues]` | New tokens on launchpad bonding curves |
| | `migrations [venues]` | Bonding curves that graduated to an AMM |
| Accounts | `accounts <venue> [AccountType]` | Live program account state, decoded with the IDL |
| | `curves` | Pump bonding curve progress milestones |
| Tools | `notify [venues]` | Telegram alerts for new pools and launches |
| | `decode <signature>` | Fetches one confirmed transaction over RPC and replays it through the matching decoders |

Venues: `pump`, `pump-amm`, `raydium-amm-v4`, `raydium-clmm`, `raydium-cpmm`, `raydium-launchlab`, `meteora-dlmm`, `meteora-damm-v1`, `meteora-damm-v2`, `meteora-dbc`, `orca-whirlpool`, `moonshot`, `fluxbeam`. Pass a comma-separated list or `all` to a `[venues]` recipe, for example `npm start -- trades pump-amm,raydium-cpmm`. `latency`, `reconnect` and `filters` default to `pump-amm`; the others default to every venue.

## Prerequisites

- Node.js 20.18 or later.
- A Yellowstone gRPC endpoint and `x-token` from the [Yellowstone gRPC dashboard](https://www.solanatracker.io/account/yellowstone-grpc).
- For `decode` only: an RPC URL that serves `getTransaction`, such as one from [Solana RPC](https://www.solanatracker.io/solana-rpc).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/25-yellowstone-grpc-examples
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

This example uses a native gRPC client, so it needs a local Node.js runtime (no browser sandboxes).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `YELLOWSTONE_GRPC_ENDPOINT` | Stream recipes | gRPC endpoint URL |
| `YELLOWSTONE_GRPC_TOKEN` | Stream recipes | `x-token` for the endpoint |
| `GRPC_COMMITMENT` | No | `processed` (default), `confirmed` or `finalized` |
| `SOLANA_RPC_URL` | `decode` | RPC URL used to fetch the transaction |
| `TELEGRAM_BOT_TOKEN` | No | Bot token for `notify`; without it messages print to the console |
| `TELEGRAM_CHAT_ID` | No | Chat to post `notify` messages to |

## Sample output

`npm start -- decode <signature>` on a PumpSwap buy (event fields trimmed):

```
slot 455218422  signer 2qa2NN47s1F6YZXthhuG3mTkXHh1pnjeJ4Egv59VzLiT  succeeded  16 instructions incl. CPIs

── PumpSwap AMM (pAMM…fXEA)
  ix 3      buyExactQuoteIn  { spendableQuoteIn: 278839, minBaseAmountOut: 355277463, trackVolume: [true] }
  ev 3      BuyEvent  { baseAmountOut: 365405021, quoteAmountIn: 278839, lpFee: 552, protocolFee: 138, coinCreatorFee: 2618, pool: "56FK…StFa", … }

── What the stream recipes print
10:13:48  pump-amm          buy   365.405021 iSzq…pump for 0.000278 SOL @ 7.631e-7 SOL  2qa2…zLiT  4oSYdW…rZkfpz
```

The last line is exactly what `trades`, `wallet`, `pool` and `price` print for the same transaction when it arrives over gRPC: `decode` runs the same decoders on RPC data reshaped into a gRPC update.

Things to know when reading the output:

- **Fees differ per venue.** Pump amounts exclude fees; Meteora DBC and DAMM v2 input amounts include them. Each decoder documents which convention its program uses.
- **`label` is the program's instruction name**, so `buyExactQuoteIn` and `buy` both show up as buys with their original name kept.
- **Processed commitment is fastest** but can include transactions on a fork that is later dropped. Use `GRPC_COMMITMENT=confirmed` when every line must be final.
- **`reconnect` uses `fromSlot`**, which only works within the server's retention window. If the slot has aged out, it warns and resumes at the head; backfill the gap over RPC. The other recipes always resume at the head.
- **`latency` compares the server's `createdAt` with your clock**, so both must be NTP-synced before the absolute numbers mean anything.
- **Pool accounts update constantly.** `accounts` against a busy AMM prints hundreds of lines per second; pass an account type to narrow it.

## Extend it

- Add a venue: drop its IDL in `idl/`, write a decoder in `src/protocols/` that returns swaps, pools or launches, and register it in `src/protocols/index.ts`. Every recipe picks it up.
- Copy trading: run `wallet` and send the mirrored swap through the Raptor swap API; see https://www.solanatracker.io/resources/solana-swap-api-typescript.
- Persist trades: replace the `console.log` in `src/recipes/trades.ts` with an insert into your database, keyed by signature and instruction path so reconnects never double-count.
- Backfill before streaming: call `fetchTransaction` from `src/lib/replay.ts` for recent signatures, then start the stream.
- Focused walkthroughs of single pieces: https://www.solanatracker.io/resources/yellowstone-grpc-setup and https://www.solanatracker.io/resources/yellowstone-grpc-account-subscribe.

## Links

- Tutorial: [Yellowstone gRPC Examples: 18 TypeScript Recipes for Solana](https://www.solanatracker.io/resources/yellowstone-grpc-examples)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
