import bs58 from "bs58";
import type { SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { fail, optionalEnv } from "./env.js";
import { short, time } from "./format.js";
import { emptyRequest, runStream } from "./grpc.js";
import { mintLabel } from "./mints.js";
import { METEORA_DLMM, parseDlmmSwaps, type DlmmSwap } from "./parse.js";
import { onShutdown } from "./shutdown.js";
import { columns, commitmentFromEnv } from "./stream-options.js";
import { formatUnits } from "./tx.js";

const pair = optionalEnv("POOL_ADDRESS");
if (pair && !isAddress(pair)) fail(`POOL_ADDRESS is not a base58 Solana address: "${pair}"`);
// Confirmed avoids printing fills from slots that later roll back; use processed for lower latency.
const commitment = commitmentFromEnv("confirmed");

const request = emptyRequest();
request.commitment = commitment.level;
request.transactions = {
  dlmm: pair
    ? // One LB pair: the pair must appear AND the DLMM program must appear.
      { accountInclude: [pair], accountRequired: [METEORA_DLMM], accountExclude: [], vote: false, failed: false }
    : { accountInclude: [METEORA_DLMM], accountRequired: [], accountExclude: [], vote: false, failed: false },
};

const feed = columns([
  ["time", 8],
  ["slot", 9],
  ["lb pair", 11],
  ["kind", 13],
  ["in", 22],
  ["out", 22],
  ["bins", 13],
  ["fill", 8],
  ["via", 11],
  ["signature", 11],
]);

const stats = { candidates: 0, swaps: 0, fromEvent: 0, fromReserves: 0, unfilled: 0 };

function onUpdate(update: SubscribeUpdate): void {
  const tx = update.transaction;
  if (!tx?.transaction) return;
  stats.candidates++;
  for (const swap of parseDlmmSwaps(tx.transaction, tx.slot)) {
    if (pair && swap.lbPair !== pair) continue;
    stats.swaps++;
    if (swap.fillSource === "event") stats.fromEvent++;
    else if (swap.fillSource === "reserves") stats.fromReserves++;
    else stats.unfilled++;
    print(swap);
  }
}

function print(s: DlmmSwap): void {
  const e = s.event;
  feed.row([
    time(),
    s.slot,
    short(s.lbPair),
    s.kind,
    leg(s.amountIn, s.inputDecimals, s.inputMint),
    leg(s.amountOut, s.outputDecimals, s.outputMint),
    // Bins crossed: a swap that moves the active bin fills at several prices.
    e ? (e.startBinId === e.endBinId ? `${e.endBinId}` : `${e.startBinId}→${e.endBinId}`) : "",
    s.fillSource,
    s.viaProgram ? short(s.viaProgram) : "direct",
    short(s.signature),
  ]);
}

function leg(raw: bigint | undefined, decimals: number | undefined, mint: string | undefined): string {
  if (raw === undefined) return "?";
  // Without decimals (mint absent from token balances) print the raw integer rather than guess.
  const value = decimals === undefined ? `${raw} raw` : formatUnits(raw, decimals, 4);
  return `${value} ${mintLabel(mint)}`;
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
  `Parsing Meteora DLMM swaps${pair ? ` for pair ${short(pair, 6)}` : ""} at ${commitment.name} commitment. Ctrl+C to stop.\n`,
);
feed.header();

onShutdown(async () => {
  stream.stop();
  await Promise.race([stream.done, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  console.log(
    `\nStopped. candidates=${stats.candidates} swaps=${stats.swaps} event=${stats.fromEvent} reserves=${stats.fromReserves} unfilled=${stats.unfilled}`,
  );
});
