# Pump.fun First Buyers

Tutorial: [https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api)

Source: [solanatracker/examples/13-pumpfun-first-buyers-sniper-api](https://github.com/solanatracker/examples/tree/main/13-pumpfun-first-buyers-sniper-api)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/13-pumpfun-first-buyers-sniper-api
cp .env.example .env
npm install
npm start
```

## Run online

Open in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=13-pumpfun-first-buyers-sniper-api%2Fsrc%2Findex.ts) (free) — add your keys to `.env`, then `npm start`. gRPC examples require a local Node runtime because of native dependencies.

## Products

- [Pump.fun API](https://www.solanatracker.io/pumpfun-api)
- [Solana Data API](https://www.solanatracker.io/data-api)

## Links

- [Blog post / guide](https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api)
- [GitHub folder](https://github.com/solanatracker/examples/tree/main/13-pumpfun-first-buyers-sniper-api)
- [All examples](https://github.com/solanatracker/examples)
- [Open in StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=13-pumpfun-first-buyers-sniper-api%2Fsrc%2Findex.ts)


## What this example does

1. Resolves a Pump.fun mint (from `TOKEN_MINT` or search)
2. Lists first buyers with buy time, invested, PnL, still holding
3. Summarizes how many are in profit vs sold
4. Optionally streams live sniper % when `ST_DATASTREAM_KEY` and `STREAM_SNIPERS=1` are set


