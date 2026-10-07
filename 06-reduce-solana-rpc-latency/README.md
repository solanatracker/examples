# Solana RPC latency benchmark

Companion code for the guide [Reduce Solana RPC Latency: Measure, Then Fix](https://www.solanatracker.io/resources/reduce-solana-rpc-latency).

Products: [Solana RPC](https://www.solanatracker.io/solana-rpc) · [Dedicated Nodes](https://www.solanatracker.io/dedicated-nodes) · [Yellowstone gRPC](https://www.solanatracker.io/yellowstone-grpc)

## What it does

- Benchmarks one or more Solana RPC endpoints side by side with plain `fetch` JSON-RPC calls (no Solana SDK).
- Times `getSlot` and `getLatestBlockhash` round trips and reports p50, p90, p99, min and max per endpoint.
- Fires `getSlot` at every endpoint in the same round and reports slot lag against the highest slot observed, so a fast but stale endpoint stands out.
- Reports the cold first request (DNS, TCP and TLS setup) separately from warm, keep-alive samples.
- Counts timeouts, HTTP 429s, HTTP errors and JSON-RPC errors per endpoint instead of dropping them, and masks `api_key` values in all output.

## Prerequisites

- Node.js 20.18 or later (24 LTS recommended).
- At least one Solana RPC URL. For Solana Tracker, copy the full endpoint including `?api_key=` from the [Shared RPC dashboard](https://www.solanatracker.io/account/shared-rpc). The Free plan works with the default pacing.
- Run it from the machine or region where your bot or backend actually runs. Results from a laptop say little about a server in another region.

## Setup

```bash
git clone https://github.com/solanatracker/examples.git
cd examples/06-reduce-solana-rpc-latency
cp .env.example .env
npm install
npm start
```

Fill in `.env` before `npm start`; the example exits with a clear message if a required variable is missing. Stop streaming examples with Ctrl+C. Run `npm run typecheck` to type-check without running.

Or open it in [StackBlitz](https://stackblitz.com/github/solanatracker/examples?file=06-reduce-solana-rpc-latency%2Fsrc%2Findex.ts), add your keys to `.env`, and run `npm start`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Yes, unless `RPC_URLS` is set | Full RPC URL including `?api_key=...`. |
| `RPC_URLS` | No | Comma-separated RPC URLs to compare. Overrides `SOLANA_RPC_URL`. |
| `SAMPLES` | No | Measured rounds per endpoint (default `20`). Use 100 or more before trusting p99. |
| `TIMEOUT_MS` | No | Per-request timeout via `AbortSignal.timeout` (default `5000`). |
| `INTERVAL_MS` | No | Pause between rounds (default `400`, which keeps one endpoint under 5 requests per second). |
| `COMMITMENT` | No | `processed`, `confirmed` (default) or `finalized`. Use the same value your app uses. |

## Sample output

```text
Benchmarking 2 endpoint(s): 20 samples, timeout 5000 ms, interval 400 ms, commitment confirmed
  https://rpc-mainnet.solanatracker.io/?api_key=***
  https://rpc.example.com/***
  round 5/20
  round 10/20
  round 15/20
  round 20/20

Completed 20 round(s) per endpoint (2 calls per round, commitment confirmed).

getSlot round trip
Endpoint                                           ok  p50      p90      p99      min      max
-------------------------------------------------  --  -------  -------  -------  -------  -------
https://rpc-mainnet.solanatracker.io/?api_key=***  20  21.4 ms  27.9 ms  41.0 ms  18.2 ms  41.0 ms
https://rpc.example.com/***                        20  64.8 ms  80.3 ms  95.6 ms  58.1 ms  95.6 ms

getLatestBlockhash round trip
Endpoint                                           ok  p50      p90      p99      min      max
-------------------------------------------------  --  -------  -------  -------  -------  -------
https://rpc-mainnet.solanatracker.io/?api_key=***  20  23.0 ms  30.5 ms  44.7 ms  19.6 ms  44.7 ms
https://rpc.example.com/***                        19  70.2 ms  88.0 ms  97.3 ms  61.5 ms  97.3 ms

Cold start and slot lag (vs highest slot seen in the same round)
Endpoint                                           cold      lag p50 (slots)  lag max (slots)  rounds behind
-------------------------------------------------  --------  ---------------  ---------------  -------------
https://rpc-mainnet.solanatracker.io/?api_key=***  112.6 ms  0                1                3/20
https://rpc.example.com/***                        241.9 ms  1                2                14/20

Errors (counted, excluded from latency)
Endpoint                     errors     last error
---------------------------  ---------  ----------------------
https://rpc.example.com/***  timeout=1  timed out after 5000 ms
```

Values are illustrative. Your numbers depend on where you run the tool, the endpoints and the time of day.

## Extend it

- Add the methods your app actually calls (`getAccountInfo`, `getMultipleAccounts`, `getProgramAccountsV2`) with realistic parameters; `getSlot` alone understates the cost of heavy reads.
- Add a `CONCURRENCY` setting that fires N requests per round to see where tail latency and 429s start for your plan.
- Write each sample to CSV with a wall-clock timestamp and run it on a schedule to catch time-of-day effects.
- Compare a shared endpoint with a [dedicated node](https://www.solanatracker.io/dedicated-nodes) in the same region before and after a cutover.
- Read the full guide: [Reduce Solana RPC latency](https://www.solanatracker.io/resources/reduce-solana-rpc-latency).

## Links

- Tutorial: [Reduce Solana RPC Latency: Measure, Then Fix](https://www.solanatracker.io/resources/reduce-solana-rpc-latency)
- Solana RPC: [https://www.solanatracker.io/solana-rpc](https://www.solanatracker.io/solana-rpc)
- Dedicated Nodes: [https://www.solanatracker.io/dedicated-nodes](https://www.solanatracker.io/dedicated-nodes)
- Yellowstone gRPC: [https://www.solanatracker.io/yellowstone-grpc](https://www.solanatracker.io/yellowstone-grpc)
- Docs: [https://docs.solanatracker.io](https://docs.solanatracker.io)
- All examples: [https://github.com/solanatracker/examples](https://github.com/solanatracker/examples)
