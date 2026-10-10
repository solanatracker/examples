# Raptor V1 JIT routing: modes, instructions and V1 transactions

Companion code for the guide [Solana JIT Swap Routing with Raptor V1 in TypeScript](https://www.solanatracker.io/resources/solana-jit-swap-routing).

Products: [Raptor Swap API](https://www.solanatracker.io/raptor) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

Runs one order through each part of Raptor V1 that changes how you build a swap:

1. **Modes.** Quotes the same order with `jitRouting=auto`, `true` and `false` and prints expected and minimum output, route, whether a JIT route was used and round-trip time, plus the difference in basis points.
2. **Instructions.** Calls `POST /swap-instructions` with `jitRouting: true` and `false`, compares account, writable and lookup-table counts, composes compute budget, setup, a memo and the swap (swap last, as `topLevelOnly` requires), compiles a V0 message against the returned lookup tables and measures it against the 1232-byte packet limit.
3. **Versions.** Builds the same JIT quote with `txVersion` `V0` and `V1` and prints size, first byte, static keys and lookup tables.
4. **Errors.** Triggers a zero amount, an unroutable mint, an edited quote and a lowercase `txVersion`, and shows how each response is classified: fix the request, quote again, change the order, or retry.
5. **Execute (optional).** With `EXECUTE=true`, quotes in `JIT_MODE`, builds V0, signs, sends with `POST /send-transaction`, tracks the signature and compares the `SwapEvent` amount with the quote.

A quote's execution plan lasts a few seconds, so every build runs straight after a fresh quote and re-quotes once if the plan expired.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- No API key: the hosted Raptor endpoint is free and unauthenticated.
- Optional: your own Solana RPC URL. The public endpoint works for one run but rate-limits quickly.
- To send a swap: a funded mainnet wallet whose base58 secret key you are willing to put in `.env`. Use a dedicated wallet with a small balance.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/24-solana-jit-swap-routing
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=24-solana-jit-swap-routing%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `RAPTOR_BASE_URL` | No | Raptor host. Defaults to `https://raptor.solanatracker.io`. |
| `SOLANA_RPC_URL` | No | RPC for mint decimals, lookup tables and blockhash. Defaults to the public mainnet endpoint. |
| `INPUT_MINT` / `OUTPUT_MINT` | No | Mints to compare. Default wrapped SOL → USDC. |
| `AMOUNT` | No | Input in base units. Default `25000000000` (25 SOL), large enough for routes to differ. Required with `EXECUTE`. |
| `SLIPPAGE_BPS` | No | Integer basis points. Default 50. |
| `JIT_MODE` | No | `auto`, `true` or `false` for the executed swap. Default `auto`. |
| `PRIORITY_FEE` | No | Priority fee level. Default `medium`. |
| `WALLET_PUBLIC_KEY` | No | Build for this address. Without it, builds use a throwaway address. |
| `WALLET_SECRET_KEY` | No | Base58 secret key, needed only for `EXECUTE=true`. |
| `EXECUTE` | No | `true` signs and sends a real swap. Default `false`. |
| `CONFIRM_TIMEOUT_SEC` | No | How long to track the signature. Default 60. |

## Sample output

25 SOL into USDC on mainnet, inspection only:

```
1. Quote the same order with each jitRouting mode

jitRouting  Expected out       Min out            Impact   Route     JIT route  Search  Round trip
----------  -----------------  -----------------  -------  --------  ---------  ------  ----------
auto        2,735.200933 USDC  2,721.524928 USDC  0.0000%  TesseraV  yes        fast    320 ms
true        2,735.200933 USDC  2,721.524928 USDC  0.0000%  TesseraV  yes        fast    58 ms
false       2,735.216426 USDC  2,721.540343 USDC  0.0000%  TesseraV  no         fast    142 ms

2. Build swap instructions for a throwaway address (inspect only)

Swap   Accounts  Writable  Lookup tables  Ixs with memo  Top level only  V0 size
-----  --------  --------  -------------  -------------  --------------  -----------------------------------
JIT    77        44        11             9              yes             1338 B, 16 static keys, over by 106
fixed  28        13        5              9              no              881 B, 12 static keys

3. Build the same JIT order as V0 and V1

txVersion  Size    First byte  Static keys  Lookup tables  Instructions  ≤ 1232 B
---------  ------  ----------  -----------  -------------  ------------  --------
V0         942 B   0x01        11           5              8             yes
V1         2064 B  0x81        52           0              7             no

4. Classify Raptor errors

Case                  HTTP  Kind         Action                   Message
--------------------  ----  -----------  -----------------------  ---------------------------------------------
Zero amount           400   bad-request  fix the request          Invalid amount: must be greater than 0
Unlisted output mint  422   no-route     change the pair or size  Failed to get quote: No multi-hop route found
Edited minAmountOut   422   stale-quote  quote again              quoteResponse: Quote expired, modified or ...
Lowercase txVersion   422   bad-request  fix the request          txVersion: unknown variant `v0`, expected ...
```

Routes, sizes and the JIT difference change with every block. Quotes run one after another, so part of any gap between modes is price movement.

## Extend it

- Add your own instructions before the swap in `compose()`, and check `v0Size()` before you sign. If a JIT plan does not fit, use `/swap` or the fixed route.
- Use `RaptorError.kind` in a bot loop: re-quote on `stale-quote`, skip on `no-route`, back off on `transient`, and alert on `bad-request`.
- Record the `SwapEvent` amounts from `GET /transaction/:signature` to measure realized vs quoted output over many fills.
- The basics of quoting, building and sending: https://www.solanatracker.io/resources/solana-swap-api-typescript.

## Links

- Tutorial: [Solana JIT Swap Routing with Raptor V1 in TypeScript](https://www.solanatracker.io/resources/solana-jit-swap-routing)
- Raptor Swap API: [https://www.solanatracker.io/raptor](https://www.solanatracker.io/raptor)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
