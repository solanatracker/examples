# Solana swap API: quote, build, sign, send and track

Companion code for the guide [Solana Swap API: Quote, Build and Send Swaps in TypeScript](https://www.solanatracker.io/resources/solana-swap-api-typescript).

Products: [Raptor Swap API](https://www.solanatracker.io/raptor) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

- Requests a routed quote from Raptor's `GET /quote` for `INPUT_MINT` → `OUTPUT_MINT` at `AMOUNT` base units and prints the expected and worst-case output, resolved slippage, price impact, value in USD and every hop of the route with its share.
- With `WALLET_PUBLIC_KEY` set, builds the unsigned V0 transaction with `POST /swap` and prints its size, instruction count, lookup tables, priority fee and `lastValidBlockHeight` (a dry run; nothing is signed).
- With `WALLET_SECRET_KEY` and `EXECUTE=true`, signs the transaction locally, submits it with `POST /send-transaction` (Yellowstone Jet TPU) and polls `GET /transaction/:signature` until it is `confirmed`, `failed` or `expired`.
- Keeps amounts as `BigInt`, reads both JSON and plain-text error bodies (a 422 `No multi-hop route found` is not retried), retries quotes and status reads with capped backoff, never retries a send, and stops cleanly on Ctrl+C.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- No API key: the hosted Raptor endpoint is free and unauthenticated.
- To send a swap: a funded mainnet wallet whose base58 secret key you are willing to put in `.env` on this machine. Use a dedicated bot wallet with a small balance.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/23-solana-swap-api-typescript
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=23-solana-swap-api-typescript%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `RAPTOR_BASE_URL` | No | Raptor host. Defaults to `https://raptor.solanatracker.io`; set it when self-hosting the binary. |
| `INPUT_MINT` / `OUTPUT_MINT` | No | Mint addresses to swap between. Default wrapped SOL → USDC. |
| `AMOUNT` | No | Input amount in base units (lamports for SOL). Default `10000000` (0.01 SOL). |
| `SLIPPAGE_BPS` | No | `dynamic` (default) or an integer in basis points. |
| `MAX_HOPS` | No | 1-4 routing hops. Default 4. |
| `DEXES` | No | Comma-separated DEX filter, e.g. `raydium,meteora,pumpfun`. |
| `PRIORITY_FEE` | No | Level (`min`, `low`, `auto`, `medium`, `high`, `veryHigh`, `turbo`, `unsafeMax`) or an exact compute unit price in microlamports. Default `medium`. |
| `MAX_PRIORITY_FEE` | No | Cap applied to the dynamic priority fee. |
| `WALLET_PUBLIC_KEY` | No | Build the unsigned transaction for this wallet (dry run). |
| `WALLET_SECRET_KEY` | No | Base58 secret key used to sign. Its public key overrides `WALLET_PUBLIC_KEY`. |
| `EXECUTE` | No | `true` signs and sends the swap on mainnet. Default `false`. |
| `CONFIRM_TIMEOUT_SEC` | No | How long to poll for a final status. Default 60. |

## Sample output

Quote only (no wallet configured), 0.01 SOL into USDC on mainnet:

```
Raptor https://raptor.solanatracker.io
Quote: 10000000 base units of So11…1112 → EPjF…Dt1v (slippage dynamic, maxHops 4)

In 10000000 So11…1112 → out 1136834 EPjF…Dt1v (min 1125465, 1.00% below expected at 100 bps slippage)
Value $1.14 | price impact 0.0058% | slot 454533225 | routed in 4.1 ms

Hop  DEX    Pool       In                  Out                Share
---  -----  ---------  ------------------  -----------------  -----
1    Crema  DV56…UZpm  10000000 So11…1112  1136834 EPjF…Dt1v  100%

Quote only. Set WALLET_PUBLIC_KEY to build the transaction, or WALLET_SECRET_KEY and EXECUTE=true to send it.
```

Dry run with `WALLET_PUBLIC_KEY` set and `AMOUNT=100000000` (0.1 SOL):

```
Built for vine…KPTg: 731 bytes, version 0, 8 instructions, 3 lookup table(s), 1 signer(s)
Priority fee 8800 lamports | valid until block height 432570852

Dry run: transaction built but not signed. Set EXECUTE=true with WALLET_SECRET_KEY to sign and send it.
```

With `WALLET_SECRET_KEY` and `EXECUTE=true` the script continues with `Sent <signature>`, a Solscan link, one line per status change and a final `confirmed`, `failed` or `expired` line with the slot and latency.

## Extend it

- Gate the swap on a risk check before `EXECUTE`; see https://www.solanatracker.io/resources/check-solana-token-rug-risk-api.
- Trigger the quote from a live event such as a Pump.fun graduation; see https://www.solanatracker.io/resources/detect-pumpfun-graduation.
- Charge a platform fee by passing `feeBps` (up to 1000) and `feeAccount` to `quote()`; the quote's `platformFee` object confirms what will be charged.
- Replace `POST /swap` with `POST /swap-instructions` when you need to add your own instructions to the transaction; the response includes the address lookup tables to load.
- Compare JIT and fixed routes on the same order, and handle `topLevelOnly` JIT instructions; see https://www.solanatracker.io/resources/solana-jit-swap-routing.
- Keep a quote fresh while a user hovers a button with the `/stream` WebSocket instead of polling `/quote`.

## Links

- Tutorial: [Solana Swap API: Quote, Build and Send Swaps in TypeScript](https://www.solanatracker.io/resources/solana-swap-api-typescript)
- Raptor Swap API: [https://www.solanatracker.io/raptor](https://www.solanatracker.io/raptor)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
