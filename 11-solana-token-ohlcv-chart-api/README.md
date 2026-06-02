# OHLCV Chart Data

Tutorial: [https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api)

Source: [solanatracker/examples/11-solana-token-ohlcv-chart-api](https://github.com/solanatracker/examples/tree/main/11-solana-token-ohlcv-chart-api)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/11-solana-token-ohlcv-chart-api
cp .env.example .env
npm install
npm start
```

## Run online

Open in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=11-solana-token-ohlcv-chart-api%2Fsrc%2Findex.ts) (free) — add your keys to `.env`, then `npm start`. gRPC examples require a local Node runtime because of native dependencies.

## Products

- [Solana Data API](https://www.solanatracker.io/data-api)

## Links

- [Blog post / guide](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api)
- [GitHub folder](https://github.com/solanatracker/examples/tree/main/11-solana-token-ohlcv-chart-api)
- [All examples](https://github.com/solanatracker/examples)
- [Open in StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=11-solana-token-ohlcv-chart-api%2Fsrc%2Findex.ts)


## What this example does

1. Loads token metadata and current price via REST
2. Fetches OHLCV bars for the last 7 days
3. Prints summary stats (range, avg volume)
4. Shows the last 5 bars and a TradingView-ready JSON snippet

Tutorial: [solanatracker.io/resources/solana-token-ohlcv-chart-api](https://www.solanatracker.io/resources/solana-token-ohlcv-chart-api)


