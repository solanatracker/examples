# Token Rug Check

Tutorial: [https://www.solanatracker.io/resources/check-solana-token-rug-risk-api](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api)

Source: [solanatracker/examples/12-check-solana-token-rug-risk-api](https://github.com/solanatracker/examples/tree/main/12-check-solana-token-rug-risk-api)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/12-check-solana-token-rug-risk-api
cp .env.example .env
npm install
npm start
```

## Run online

Open in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=12-check-solana-token-rug-risk-api%2Fsrc%2Findex.ts) (free) — add your keys to `.env`, then `npm start`. gRPC examples require a local Node runtime because of native dependencies.

## Products

- [Solana Data API](https://www.solanatracker.io/data-api)
- [Rugcheck](https://www.solanatracker.io/rugcheck)

## Links

- [Blog post / guide](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api)
- [GitHub folder](https://github.com/solanatracker/examples/tree/main/12-check-solana-token-rug-risk-api)
- [All examples](https://github.com/solanatracker/examples)
- [Open in StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=12-check-solana-token-rug-risk-api%2Fsrc%2Findex.ts)


## What this example does

Builds a programmatic rug check like [Rugcheck](https://www.solanatracker.io/rugcheck):

1. Fetches full token + risk payload
2. Prints holder-risk breakdown (snipers, insiders, bundlers, dev)
3. Lists authority / liquidity flags
4. Runs a `passRiskGate()` you can drop into a bot


