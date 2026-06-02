# Live Trades WebSocket

Tutorial: [https://www.solanatracker.io/resources/stream-solana-trades-websocket](https://www.solanatracker.io/resources/stream-solana-trades-websocket)

Source: [solanatracker/examples/15-stream-solana-trades-websocket](https://github.com/solanatracker/examples/tree/main/15-stream-solana-trades-websocket)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/15-stream-solana-trades-websocket
cp .env.example .env
npm install
npm start
```

## Run online

Open in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=15-stream-solana-trades-websocket%2Fsrc%2Findex.ts) (free) — add your keys to `.env`, then `npm start`. gRPC examples require a local Node runtime because of native dependencies.

## Products

- [Solana Data API](https://www.solanatracker.io/data-api)

## Links

- [Blog post / guide](https://www.solanatracker.io/resources/stream-solana-trades-websocket)
- [GitHub folder](https://github.com/solanatracker/examples/tree/main/15-stream-solana-trades-websocket)
- [All examples](https://github.com/solanatracker/examples)
- [Open in StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=15-stream-solana-trades-websocket%2Fsrc%2Findex.ts)


## What this example does

This is a **trade tape**, not a bare `subscribe` call:

1. REST backfill — token context + last trades before going live
2. Formatted tape output (side, USD, wallet, signature)
3. Running buy/sell + volume stats every 30s
4. Auto-reconnect on disconnect

Contrast with [price WebSocket](/resources/realtime-solana-price-websocket) which only streams aggregated quotes.


