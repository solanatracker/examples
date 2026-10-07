import bs58 from "bs58";
import type { SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { fail, optionalEnv } from "./env.js";
import { short, time } from "./format.js";
import { emptyRequest, runStream } from "./grpc.js";
import { mintLabel } from "./mints.js";
import { parseRaydiumSwaps, RAYDIUM_AMM_V4, WSOL_MINT, type Leg, type RaydiumSwap } from "./parse.js";
import { onShutdown } from "./shutdown.js";
import { columns, commitmentFromEnv } from "./stream-options.js";
import { formatUnits } from "./tx.js";

const pool = optionalEnv("POOL_ADDRESS");
if (pool && !isAddress(pool)) fail(`POOL_ADDRESS is not a base58 Solana address: "${pool}"`);
// Confirmed avoids printing fills from slots that later roll back; use processed for lower latency.
const commitment = commitmentFromEnv("confirmed");

const request = emptyRequest();
request.commitment = commitment.level;
request.transactions = {
  raydium: pool
    ? // One pool: the pool must appear AND the AMM program must appear.
      { accountInclude: [pool], accountRequired: [RAYDIUM_AMM_V4], accountExclude: [], vote: false, failed: false }
    : { accountInclude: [RAYDIUM_AMM_V4], accountRequired: [], accountExclude: [], vote: false, failed: false },
};

const feed = columns([
  ["time", 8],
  ["slot", 9],
  ["pool", 11],
  ["sold", 24],
  ["bought", 24],
  ["SOL/token", 12],
  ["via", 11],
  ["signature", 11],
]);

const stats = { candidates: 0, withSwap: 0, swaps: 0, unattributed: 0 };

function onUpdate(update: SubscribeUpdate): void {
  const tx = update.transaction;
  if (!tx?.transaction) return;
  stats.candidates++;
  // The filter matches any transaction that lists the program key; many never invoke it.
  const swaps = parseRaydiumSwaps(tx.transaction, tx.slot).filter((s) => !pool || s.pool === pool);
  if (swaps.length > 0) stats.withSwap++;
  for (const swap of swaps) {
    stats.swaps++;
    print(swap);
  }
}

function print(s: RaydiumSwap): void {
  if (!s.input || !s.output) {
    stats.unattributed++;
    feed.row([time(), s.slot, short(s.pool), `${s.kind}: no vault delta`, "", "", via(s), short(s.signature)]);
    return;
  }
  // Several swaps on one pool in one transaction share the vault deltas; mark the row as a net amount.
  const net = s.poolSwapsInTx > 1 ? " (net)" : "";
  feed.row([
    time(),
    s.slot,
    short(s.pool),
    `${amount(s.input)} ${mintLabel(s.input.mint)}${net}`,
    `${amount(s.output)} ${mintLabel(s.output.mint)}${net}`,
    solPerToken(s.input, s.output),
    via(s),
    short(s.signature),
  ]);
}

const amount = (leg: Leg) => formatUnits(leg.raw, leg.decimals, 4);
const via = (s: RaydiumSwap) => (s.viaProgram ? short(s.viaProgram) : "direct");

function solPerToken(input: Leg, output: Leg): string {
  const ui = (leg: Leg) => Number(leg.raw) / 10 ** leg.decimals;
  if (input.mint === WSOL_MINT && ui(output) > 0) return (ui(input) / ui(output)).toPrecision(4);
  if (output.mint === WSOL_MINT && ui(input) > 0) return (ui(output) / ui(input)).toPrecision(4);
  return "";
}

function isAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

// runStream checks YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN before anything prints.
const stream = runStream({ request, onUpdate });
console.log(
  `Parsing Raydium AMM v4 swaps${pool ? ` for pool ${short(pool, 6)}` : ""} at ${commitment.name} commitment. Ctrl+C to stop.\n`,
);
feed.header();

onShutdown(async () => {
  stream.stop();
  await Promise.race([stream.done, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  console.log(
    `\nStopped. candidates=${stats.candidates} with-swap=${stats.withSwap} swaps=${stats.swaps} unattributed=${stats.unattributed}`,
  );
});
