import bs58 from "bs58";
import { SlotStatus, type SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { fail, optionalEnv } from "./env.js";
import { compact, short, time } from "./format.js";
import { emptyRequest, runStream } from "./grpc.js";
import { onShutdown } from "./shutdown.js";
import { columns, commitmentFromEnv } from "./stream-options.js";

// Pump.fun program: busy enough to show matches in every block. Set WATCH_ADDRESS to any program or account.
const DEFAULT_WATCH = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const watch = optionalEnv("WATCH_ADDRESS") ?? DEFAULT_WATCH;
if (!isAddress(watch)) fail(`WATCH_ADDRESS is not a base58 Solana address: "${watch}"`);
const commitment = commitmentFromEnv("confirmed");

// One request carries every filter. Writing a new request later replaces all of them.
const request = emptyRequest();
request.commitment = commitment.level;
request.slots = { slots: { filterByCommitment: true } };
request.blocksMeta = { blocks: {} };
request.transactions = {
  watched: { accountInclude: [watch], accountExclude: [], accountRequired: [], vote: false, failed: false },
};

type Pending = { slot: bigint; blockTimeMs: number | undefined; txs: string };

const matches = new Map<bigint, { count: number; sample: string }>();
let pending: Pending | undefined;
let lastBlockSlot: bigint | undefined;
let tipSlot: bigint | undefined;
const stats = { blocks: 0, matched: 0, gaps: 0, deadSlots: 0 };

const feed = columns([
  ["time", 8],
  ["slot", 11],
  ["block txs", 9],
  ["matched", 7],
  ["sample signature", 16],
]);

// runStream validates YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN before anything is printed.
const stream = runStream({ request, onUpdate });
console.log(`Watching ${short(watch, 6)} at ${commitment.name} commitment. Ctrl+C to stop.\n`);
feed.header();

function onUpdate(update: SubscribeUpdate): void {
  if (update.slot) {
    const slot = BigInt(update.slot.slot);
    if (tipSlot === undefined || slot > tipSlot) tipSlot = slot;
    if (update.slot.status === SlotStatus.SLOT_DEAD) {
      stats.deadSlots++;
      console.warn(`  slot ${slot} marked dead${update.slot.deadError ? `: ${update.slot.deadError}` : ""}`);
    }
    return;
  }

  if (update.transaction?.transaction) {
    // Slot lives on the wrapper; signature and meta live one level down. u64 values arrive as strings.
    const slot = BigInt(update.transaction.slot);
    const entry = matches.get(slot) ?? { count: 0, sample: bs58.encode(update.transaction.transaction.signature) };
    entry.count++;
    matches.set(slot, entry);
    stats.matched++;
    return;
  }

  if (update.blockMeta) {
    const meta = update.blockMeta;
    const slot = BigInt(meta.slot);
    const parent = BigInt(meta.parentSlot);

    // A block whose parent is not the last block we saw means a missed block (disconnect, lag) or a fork switch.
    if (lastBlockSlot !== undefined && parent !== lastBlockSlot && slot > lastBlockSlot) {
      stats.gaps++;
      console.warn(`  gap: block ${slot} has parent ${parent}, last block seen was ${lastBlockSlot}; backfill this range`);
    }
    if (lastBlockSlot === undefined || slot > lastBlockSlot) lastBlockSlot = slot;
    stats.blocks++;

    // Print the previous block now, so transactions that arrive after its meta are still counted.
    flush();
    const seconds = meta.blockTime?.timestamp;
    pending = {
      slot,
      blockTimeMs: seconds ? Number(seconds) * 1000 : undefined,
      txs: compact(Number(meta.executedTransactionCount)),
    };
  }
}

function flush(): void {
  if (!pending) return;
  const m = matches.get(pending.slot);
  feed.row([
    time(pending.blockTimeMs),
    pending.slot.toString(),
    pending.txs,
    String(m?.count ?? 0),
    m ? short(m.sample, 5) : "",
  ]);
  // Keep memory bounded: drop counters for this slot and anything older.
  for (const slot of matches.keys()) if (slot <= pending.slot) matches.delete(slot);
  pending = undefined;
}

function isAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

onShutdown(async () => {
  stream.stop();
  // done can be mid-backoff; do not hold Ctrl+C hostage to a reconnect timer.
  await Promise.race([stream.done, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  flush();
  console.log(
    `\nStopped. blocks=${stats.blocks} matched=${stats.matched} gaps=${stats.gaps} dead=${stats.deadSlots} tip=${tipSlot ?? "n/a"}`,
  );
});
