# Solana rug check risk gate

Companion code for the guide [Solana Rug Check API: Risk Scores, Factors and a Bot Gate](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Pump.fun API](https://www.solanatracker.io/pumpfun-api)

## What it does

- Reads the `risk` object returned with every token from the Solana Tracker Data API (`getTokenInfo`)
- Prints the risk score, rugged flag, every reported risk factor, and sniper, insider, bundler, developer and top-10 holdings
- Calls the dedicated bundlers endpoint (`getTokenBundlers`) because `risk.bundlers` can be omitted from the token response
- Applies a configurable gate (`MAX_RISK_SCORE`, sniper and insider caps, danger factors) with three outcomes: PASS, FAIL, UNKNOWN
- Without `TOKEN_MINT`, screens the top 10 tokens on the 1h trending list in a single request

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended)
- A Solana Tracker Data API key from https://www.solanatracker.io/account/data-api. Each run makes one REST request (trending mode) or two (single-mint mode)

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/12-check-solana-token-rug-risk-api
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=12-check-solana-token-rug-risk-api%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ST_API_KEY` | Yes | Data API key |
| `TOKEN_MINT` | No | Mint to check in detail. Empty = screen the 1h trending list |
| `MAX_RISK_SCORE` | No | Fail above this score (1-10, higher = riskier). Default `6` |
| `MAX_SNIPER_PCT` | No | Fail when snipers hold more than this percent of supply. Default `20` |
| `MAX_INSIDER_PCT` | No | Fail when insiders hold more than this percent of supply. Default `20` |
| `BLOCK_DANGER_FACTORS` | No | Fail on any factor with level `danger`. Default `true` |

## Sample output

Illustrative values; your output depends on the token and the time you run it.

```text
Solana rug check (score is a signal, not a guarantee)
Policy: score <= 6, snipers <= 20%, insiders <= 20%, danger factors block

EXMPL (Example Token)  7xKXtg…sgAsU3
Deepest pool 9mHo…pump on pumpfun-amm  liquidity $48.2K  mcap $310.5K  holders 1874
Risk score 7 / 10   rugged: no   jupiterVerified: no

Holder groups (groups can overlap; do not add them up)
Group      Wallets  Supply held
---------  -------  -----------
Snipers    6        12.40%
Insiders   2        3.10%
Bundlers   14       4.85%
Developer  -        0.00%
Top 10     10       31.22%

Risk factors (3)
Level    Factor           Detail
-------  ---------------  ----------------------------------------------------
warning  Snipers          12.40%
danger   Top 10 Holders   Top 10 holders own more than 15% of the total supply
warning  No social media  Token has no associated social media links

Risk gate (MAX_RISK_SCORE=6): FAIL
  - score 7 > 6
  - danger: Top 10 Holders
```

## Extend it

- Feed the gate from a screener: pre-filter with `maxRiskScore` in search, then run the full check on candidates. See https://www.solanatracker.io/resources/solana-token-search-screener-api
- Keep a live watch after the first check with the Datastream `snipers`, `insiders` and `bundlers` rooms (Premium plan or higher)
- Log every verdict with the policy values and a timestamp so you can explain past decisions
- Add an early-buyer view for the same mint. See https://www.solanatracker.io/resources/pumpfun-first-buyers-sniper-api

## Links

- Tutorial: [Solana Rug Check API: Risk Scores, Factors and a Bot Gate](https://www.solanatracker.io/resources/check-solana-token-rug-risk-api)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Pump.fun API: [https://www.solanatracker.io/pumpfun-api](https://www.solanatracker.io/pumpfun-api)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
