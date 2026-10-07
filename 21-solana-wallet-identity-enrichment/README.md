# Solana wallet identity labels for trades and holders

Companion code for the guide [Solana Wallet Identity API: Label Traders and Holders](https://www.solanatracker.io/resources/solana-wallet-identity-enrichment).

Products: [Solana Data API](https://www.solanatracker.io/data-api) · [Solana RPC](https://www.solanatracker.io/solana-rpc)

## What it does

- Fetches recent swaps for `TOKEN_MINT` with `getTokenTradeHistory(mint, { enrich: 'identity' })` and prints each trade with the wallet's label, primary badge (`identity.type`) and full tag list.
- Falls back to the short address when `identity` is `null` or has no name, and normalizes Twitter handles that already include `@`.
- Reports label coverage: labeled trades, labeled wallets, share of volume from labeled wallets, and wallet counts per tag.
- Fetches the top 100 holders with `getTokenHolders(mint, 'identity')` and shows token-scoped roles such as pool accounts and developers, plus how much supply sits in pool and exchange accounts.
- Retries rate limits and 5xx errors with capped backoff and validates inputs before calling the API.

## Prerequisites

- Node.js 20.18 or newer (24 LTS recommended).
- A Solana Tracker Data API key.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/21-solana-wallet-identity-enrichment
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=21-solana-wallet-identity-enrichment%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ST_API_KEY` | Yes | Data API key from the dashboard. |
| `TOKEN_MINT` | No | Token whose trades and holders to label. Defaults to the token used in the docs examples. |
| `LIMIT` | No | Swaps to fetch with identity, 1 to 500. Default `100`. |
| `SHOW_ROWS` | No | Rows to print per table. Default `25`. |
| `DATA_API_BASE_URL` | No | Override the Data API host. Leave empty for the default. |

## Sample output

Illustrative values; labels and trades change constantly.

```text
Last 100 swap(s) for 6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN, identity enriched

Time      Side  Wallet     Label              Badge          Volume   Tags
--------  ----  ---------  -----------------  -------------  -------  ----------------
09:41:07  buy   BwWK…de6s  Mayhem Bot         bot            $412.50  bot
09:41:02  sell  F7R6…8EMi  F7R6…8EMi          -              $540.00
09:40:55  buy   CyaE…a54o  Cented             kol            $2,310   kol,axiom,bloom,sns
09:40:51  buy   9aoU…Y8p   solanatracker.sol  sns            $88.20   sns
09:40:48  sell  4kQz…r7Vm  4kQz…r7Vm          potential_bot  $19.75   potential_bot

Labeled: 41/100 trades, 18/63 wallets, 57.3% of volume
Wallets by tag: axiom 9, potential_bot 5, kol 3, bloom 3, sns 2, bot 1

Top holders (12.4K total), identity enriched

#  Wallet     Label       Badge  Role / detail    Supply  Value
-  ---------  ----------  -----  ---------------  ------  ------
1  HYLH…ySC5  HYLH…ySC5   pool   pool pumpfun     18.40%  $597.7
2  BwWK…de6s  Mayhem Bot  bot                     3.12%   $560.0
3  8vNw…Qe1T  8vNw…Qe1T   -                       1.95%   $350.1

Pool and exchange accounts among top holders: 1, holding 18.40% of supply
```

## Extend it

- Rank the labeled wallets by profit with the PnL leaderboard and token traders endpoints; see https://www.solanatracker.io/resources/solana-pnl-leaderboard-api.
- Add `walletPnl` to the holders call (`getTokenHolders(mint, 'identity,walletPnl')`) to show each holder's token and lifetime PnL beside its label.
- Stream the same token live with `subscribe.tx.token(mint, { enriched: true })` and handle `identityStatus: 'partial'`; see https://www.solanatracker.io/resources/stream-solana-trades-websocket.
- Resolve `.sol` names for addresses that come back unlabeled with the SNS RPC methods; see https://www.solanatracker.io/resources/solana-rpc-sns-domains-update.

## Links

- Tutorial: [Solana Wallet Identity API: Label Traders and Holders](https://www.solanatracker.io/resources/solana-wallet-identity-enrichment)
- Solana Data API: [https://www.solanatracker.io/data-api](https://www.solanatracker.io/data-api)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
