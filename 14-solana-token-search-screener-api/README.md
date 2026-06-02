# Token Screener Search

Tutorial: [https://www.solanatracker.io/resources/solana-token-search-screener-api](https://www.solanatracker.io/resources/solana-token-search-screener-api)

Source: [solanatracker/examples/14-solana-token-search-screener-api](https://github.com/solanatracker/examples/tree/main/14-solana-token-search-screener-api)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/14-solana-token-search-screener-api
cp .env.example .env
npm install
npm start
```

## Run online

Open in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=14-solana-token-search-screener-api%2Fsrc%2Findex.ts) (free) — add your keys to `.env`, then `npm start`. gRPC examples require a local Node runtime because of native dependencies.

## Products

- [Solana Data API](https://www.solanatracker.io/data-api)
- [Memescope](https://www.solanatracker.io/memescope)
- [Pump.fun API](https://www.solanatracker.io/pumpfun-api)

## Links

- [Blog post / guide](https://www.solanatracker.io/resources/solana-token-search-screener-api)
- [GitHub folder](https://github.com/solanatracker/examples/tree/main/14-solana-token-search-screener-api)
- [All examples](https://github.com/solanatracker/examples)
- [Open in StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=14-solana-token-search-screener-api%2Fsrc%2Findex.ts)


## What this example does

Runs three saved screener profiles against the Search API:

1. **Graduating** — Pump.fun tokens at 85–99% curve
2. **Safer volume** — high liquidity + decentralized holders
3. **Active** — min txn count + volume filters

Copy a profile into your bot and adjust thresholds.


