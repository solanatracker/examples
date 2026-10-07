# Stream Pump.fun launches over WebSocket

Companion code for the guide [Pump.fun WebSocket API: Stream New Token Launches](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket).

Products: [Pump.fun API](https://www.solanatracker.io/pumpfun-api) · [Solana Data API](https://www.solanatracker.io/data-api)

## What it does

- Subscribes to the Datastream `latest` room with `@solana-tracker/data-api` and keeps only messages that carry a Pump.fun bonding-curve pool (`market === "pumpfun"`).
- Prints one aligned row per launch: symbol, mint, curve %, liquidity, market cap, risk score and creator.
- Backfills from `GET /tokens/latest` on the first connect and after every reconnect, throttled to once per 15 seconds.
- Deduplicates by mint across live and backfilled rows for `DEDUPE_MINUTES`.
- Relies on the SDK's built-in reconnect (capped exponential backoff with jitter, rooms rejoined) and exits cleanly on Ctrl+C with a short summary.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API plan with Datastream access (Premium or higher). Both keys are in the [Data API dashboard](https://www.solanatracker.io/account/data-api).

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/04-stream-pumpfun-launches-websocket
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=04-stream-pumpfun-launches-websocket%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key, used for the `GET /tokens/latest` backfill |
| `ST_DATASTREAM_KEY` | Yes | Datastream key or the full `wss://datastream.solanatracker.io/<key>` URL |
| `MIN_LIQUIDITY_USD` | No | Skip launches whose curve pool has less USD liquidity (default `0`) |
| `DEDUPE_MINUTES` | No | Window for suppressing repeat alerts per mint (default `30`) |
| `BACKFILL_PAGES` | No | Pages of `/tokens/latest` to read per (re)connect, 0-10 (default `1`) |

## Sample output

Illustrative values; your rows depend on live launches.

```text
Watching Pump.fun launches (min liquidity $0.00, dedupe 30 min). Ctrl+C to stop.

Time      Src   Symbol        Mint         Curve   Liquidity   MCap      Risk   Creator
--------  ----  ------------  -----------  ------  ----------  --------  -----  -----------
[datastream] connected
[backfill] 41 Pump.fun launches in 100 latest tokens
14:02:11  rest  EXAMPLE       AmJa…pump    0%      $8,907.76   $4.29K    5/10   4Rz5…4Hqo
14:02:13  rest  CURVE         7sGd…pump    3%      $9,120.40   $5.1K     6/10   CQdr…TudY
14:02:19  live  DEMO          9xQe…pump    0%      $8,840.12   $4.2K     5/10   J5gX…CgBW
14:02:24  live  SAMPLE        3kLp…pump    1%      $8,995.03   $4.35K    n/a    Fh2s…Q9xd
^C
Stopped. live 2, backfill 41, below liquidity 0, duplicates 3
```

## Extend it

- Raise `MIN_LIQUIDITY_USD` or add a filter on `token.strictSocials` before alerting.
- Push each row into a durable queue (Redis, SQS, Postgres) keyed by mint instead of printing, so restarts do not resend alerts.
- Follow each mint through its curve and migration with the [Pump.fun graduation guide](https://www.solanatracker.io/resources/detect-pumpfun-graduation).
- Pull the first buyers of a launch a few minutes later with the [Pump.fun first buyers guide](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api).
- Need instruction-level detection instead of indexed events? Compare with [Pump.fun mints over Yellowstone gRPC](https://www.solanatracker.io/resources/pumpfun-stream-new-minted-tokens).

## Links

- Tutorial: [Pump.fun WebSocket API: Stream New Token Launches](https://www.solanatracker.io/resources/stream-pumpfun-launches-websocket)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
