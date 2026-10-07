import type { SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { short, time } from "./format.js";
import { emptyRequest, runStream } from "./grpc.js";
import { cleanText, parseCreates, PUMP_MINT_AUTHORITY, PUMP_PROGRAM, type NewMint } from "./parse.js";
import { onShutdown } from "./shutdown.js";
import { columns, commitmentFromEnv } from "./stream-options.js";

// Processed is the lowest-latency level; a rolled-back slot can still drop a mint you already printed.
const commitment = commitmentFromEnv("processed");

const request = emptyRequest();
request.commitment = commitment.level;
request.transactions = {
  pumpCreates: {
    accountInclude: [PUMP_PROGRAM],
    // Only create instructions reference the mint-authority PDA, so buys and sells never leave the server.
    accountRequired: [PUMP_MINT_AUTHORITY],
    accountExclude: [],
    vote: false,
    failed: false,
  },
};

const feed = columns([
  ["time", 8],
  ["slot", 9],
  ["ver", 3],
  ["mint", 44],
  ["symbol", 10],
  ["name", 24],
  ["creator", 11],
  ["via", 11],
]);

// Reconnects and processed-level redelivery can repeat a transaction; key on signature + instruction path.
const seen = new Set<string>();
const remember = (key: string): boolean => {
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 10_000) seen.delete(seen.values().next().value as string);
  return true;
};

let total = 0;

function onUpdate(update: SubscribeUpdate): void {
  const tx = update.transaction;
  if (!tx?.transaction) return;
  for (const mint of parseCreates(tx.transaction, tx.slot)) {
    if (!remember(`${mint.signature}:${mint.path}`)) continue;
    total++;
    print(mint);
  }
}

function print(m: NewMint): void {
  feed.row([
    time(),
    m.slot,
    m.variant === "create_v2" ? "v2" : "v1",
    m.mint,
    cleanText(m.symbol, 10),
    cleanText(m.name, 24),
    short(m.creator),
    m.viaProgram ? short(m.viaProgram) : "direct",
  ]);
}

// runStream checks YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN before anything prints.
const stream = runStream({ request, onUpdate });
console.log(`Streaming Pump.fun creates at ${commitment.name} commitment. Ctrl+C to stop.\n`);
feed.header();

onShutdown(async () => {
  stream.stop();
  await Promise.race([stream.done, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  console.log(`\nStopped after ${total} new mint(s).`);
});
