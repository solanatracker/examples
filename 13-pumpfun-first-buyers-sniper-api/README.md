# Pump.fun first buyers and sniper report

Companion code for the guide [Pump.fun First Buyers API: Snipers, Insiders and PnL](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api).

Products: [Pump.fun API](https://www.solanatracker.io/pumpfun-api) · [Solana Data API](https://www.solanatracker.io/data-api)

## What it does

- Fetches the earliest buyers of a Pump.fun token from `GET /v2/pnl/tokens/{token}/first-buyers` with `getPnlV2TokenFirstBuyers`, ordered by first trade.
- Pulls the token's risk block (`GET /tokens/{token}`) and bundler list (`GET /tokens/{token}/bundlers`) and flags each early buyer as sniper (S), insider (I) or bundler (B).
- Prints one row per wallet: first trade, invested, token PnL, ROI, holding or exited, hold time, and the wallet's lifetime PnL kept in a separate column.
- Summarizes the cohort: still holding, exited in profit or at a loss, moved out by transfer without selling, quick flips, flagged wallets.
- With `WATCH_RISK=true`, stays connected to the Datastream `sniper:{token}`, `insider:{token}` and `bundlers:{token}` rooms and prints every percentage change.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key from the [Data API dashboard](https://www.solanatracker.io/account/data-api). `WATCH_RISK` needs Datastream access (Premium or higher).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/13-pumpfun-first-buyers-sniper-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=13-pumpfun-first-buyers-sniper-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key |
| `TOKEN_MINT` | No | Pump.fun mint to analyze; empty picks the top 24h-volume Pump.fun token from `/search` |
| `FIRST_BUYERS_LIMIT` | No | First buyers to fetch, 1-200 (default `50`) |
| `QUICK_FLIP_SECONDS` | No | Exit window that counts as a quick flip (default `300`) |
| `WATCH_RISK` | No | `true` to stream sniper, insider and bundler changes after the report (default `false`) |
| `ST_DATASTREAM_KEY` | With `WATCH_RISK` | Datastream key or the full `wss://datastream.solanatracker.io/<key>` URL |

## Sample output

Illustrative values; real rows depend on the token.

```text
EXAMPLE (Example Coin)  ExampLeMint1111111111111111111111111111pump
price $0.000412  mcap $412K  liq $61.2K  market pumpfun-amm
risk 6/10  snipers 7 (3.4%)  insiders 4 (8.1%)  top10 22.7%  dev 0.0%  bundlers 12 (2.9% now)

#  Wallet      Label     First trade     Invested  Token PnL  ROI    State     Held  Lifetime PnL  Flags
-  ----------  --------  --------------  --------  ---------  -----  --------  ----  ------------  -----
1  4Rz5…4Hqo             10-06 14:02:11  $512      $3.1K      +605%  exited +  41s   $88.4K        SB
2  CQdr…TudY   axiom     10-06 14:02:11  $1.2K     $-410      -34%   exited -  3m    $-2.1K        S
3  J5gX…CgBW             10-06 14:02:14  $95       $1.7K      +1790% holding   1.0d  $640          I
4  Fh2s…Q9xd             10-06 14:02:19  $240      $-61       -25%   exited -  12m   n/a           -

Summary: 4 first buyers shown of 1.9K (more pages)
  holding 1, exited in profit 1, exited at a loss 2, moved out without selling 0, quick flips (<= 300s) 2, flagged S/I/B 3
  invested $2.05K, token PnL $4.33K (realized + unrealized at the current price)
  Defaults exclude arbitrage wallets and zero-buy rows. Flags: S sniper, I insider, B bundler.
```

## Extend it

- Page through the full cohort with `pagination.nextCursor` and store each wallet's first-trade rank.
- Rank the same token's traders by realized PnL with `getPnlV2TokenTraders` and compare against the first-buyer cohort.
- Feed new mints in from the [Pump.fun WebSocket launch stream](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket) and run this report a few minutes after launch.
- Re-run the report when a token migrates, using the [Pump.fun graduation guide](https://www.solanatracker.io/resources/detect-pumpfun-graduation).
- Combine the flags with the token's risk factors from the [rug risk API guide](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api).

## Links

- Tutorial: [Pump.fun First Buyers API: Snipers, Insiders and PnL](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
