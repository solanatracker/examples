/**
 * Connection-level recipes: what every stream needs before any decoding happens.
 */
import { SlotStatus, type SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { createInterface } from "node:readline";
import { time } from "../lib/format.js";
import { emptyRequest, runStream } from "../lib/grpc.js";
import { parseTx } from "../lib/parsed.js";
import { onShutdown } from "../lib/shutdown.js";
import { tradeLine } from "../lib/show.js";
import { commitment, txFilter } from "../lib/watch.js";
import { PROTOCOLS, selectProtocols, type Protocol } from "../protocols/index.js";

const STATUS: Record<number, string> = {
  [SlotStatus.SLOT_FIRST_SHRED_RECEIVED]: "first shred",
  [SlotStatus.SLOT_CREATED_BANK]: "bank created",
  [SlotStatus.SLOT_COMPLETED]: "completed",
  [SlotStatus.SLOT_PROCESSED]: "processed",
  [SlotStatus.SLOT_CONFIRMED]: "confirmed",
  [SlotStatus.SLOT_FINALIZED]: "finalized",
  [SlotStatus.SLOT_DEAD]: "dead",
};

/**
 * `slots [seconds]`: the smallest useful subscription. Prints every slot status change, and with a
 * duration, closes the stream cleanly when it elapses (the same path Ctrl+C takes).
 */
export async function slots(args: string[]) {
  const seconds = Number(args[0] ?? 0);
  const request = { ...emptyRequest(), slots: { slots: { filterByCommitment: false, interslotUpdates: true } } };
  const stream = runStream({
    request,
    onUpdate: ({ slot }) => {
      if (slot) console.log(`${time()}  slot ${slot.slot}  ${STATUS[slot.status] ?? slot.status}${slot.deadError ? `  (${slot.deadError})` : ""}`);
    },
  });
  const close = async () => {
    stream.stop();
    await stream.done;
    console.log("[grpc] stream closed");
  };
  onShutdown(close);
  if (seconds > 0) {
    setTimeout(() => void close().then(() => process.exit(0)), seconds * 1000);
  }
  await stream.done;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

/**
 * `latency [venues]`: how long updates take to reach you. Each update carries `createdAt`, the time
 * the server produced it; the gap to local receive time is network plus queueing delay.
 * Both clocks must be NTP-synced for the absolute numbers to mean anything.
 */
export async function latency(args: string[]) {
  const protocols = selectProtocols(args[0] ?? "pump-amm");
  const label = protocols.map((p) => p.label).join(", ");
  let samples: number[] = [];
  const stream = runStream({
    request: { ...emptyRequest(), commitment: commitment(), transactions: { txs: txFilter({ accountInclude: protocols.map((p) => p.programId) }) } },
    onUpdate: (update) => {
      if (update.transaction && update.createdAt) samples.push(Date.now() - update.createdAt.getTime());
    },
  });
  const timer = setInterval(() => {
    const sorted = samples.sort((a, b) => a - b);
    samples = [];
    if (sorted.length === 0) return console.log(`${time()}  no ${label} transactions in the last 10s`);
    console.log(
      `${time()}  ${sorted.length} tx  p50 ${quantile(sorted, 0.5)} ms  p90 ${quantile(sorted, 0.9)} ms  p99 ${quantile(sorted, 0.99)} ms  max ${sorted.at(-1)} ms`,
    );
  }, 10_000);
  onShutdown(async () => {
    clearInterval(timer);
    stream.stop();
    await stream.done;
  });
  console.log(`Measuring ${label} transaction delivery; a summary prints every 10 seconds.`);
  await stream.done;
}

/** Resume attempts that deliver nothing before `reconnect` gives up on `fromSlot` and starts at the head. */
const MAX_EMPTY_RESUMES = 3;

/**
 * `reconnect [venues]`: resume where the stream left off. After a drop, the request is rebuilt with
 * `fromSlot` set to the last slot seen, so the server replays what was missed (within its retention
 * window). Replayed transactions overlap with ones already handled, so signatures are de-duplicated.
 * If the slot has aged out of the window, the server rejects every resume; after a few attempts the
 * recipe drops `fromSlot`, reports the gap, and continues from the head.
 */
export async function reconnect(args: string[]) {
  const protocols = selectProtocols(args[0] ?? "pump-amm");
  const label = protocols.map((p) => p.label).join(", ");
  let lastSlot: bigint | undefined;
  let emptyResumes = 0;
  const seen = new Set<string>();
  const remember = (signature: string) => {
    seen.add(signature);
    // Keep memory bounded: Sets iterate in insertion order, so the oldest entries go first.
    if (seen.size > 50_000) for (const old of [...seen].slice(0, 10_000)) seen.delete(old);
  };

  const stream = runStream({
    request: (isReconnect) => {
      if (isReconnect && lastSlot !== undefined && ++emptyResumes > MAX_EMPTY_RESUMES) {
        console.warn(`[grpc] slot ${lastSlot} is no longer replayable; resuming at the head. Backfill the gap over RPC.`);
        lastSlot = undefined;
        emptyResumes = 0;
      }
      return {
        ...emptyRequest(),
        commitment: commitment(),
        transactions: { txs: txFilter({ accountInclude: protocols.map((p) => p.programId) }) },
        ...(isReconnect && lastSlot !== undefined ? { fromSlot: lastSlot.toString() } : {}),
      };
    },
    onConnect: (isReconnect) => {
      if (isReconnect) console.log(`[grpc] resubscribed, replaying from slot ${lastSlot ?? "head"}`);
    },
    onUpdate: (update) => {
      const t = update.transaction;
      if (!t?.transaction) return;
      emptyResumes = 0;
      const tx = parseTx(t.transaction, t.slot);
      const slot = BigInt(t.slot);
      if (lastSlot === undefined || slot > lastSlot) lastSlot = slot;
      if (seen.has(tx.signature)) return;
      remember(tx.signature);
      for (const p of protocols) for (const trade of p.trades(tx)) console.log(tradeLine(trade, tx));
    },
  });
  onShutdown(async () => {
    stream.stop();
    await stream.done;
  });
  console.log(`Streaming ${label} trades. Drop your network to watch the stream resume from the last slot.`);
  await stream.done;
}

/**
 * `filters [venues]`: change what a live stream delivers without reconnecting. Writing a new
 * request to the open stream replaces the whole filter set. Type `+venue` or `-venue` and Enter.
 */
export async function filters(args: string[]) {
  const active = new Map<string, Protocol>(selectProtocols(args[0] ?? "pump-amm").map((p) => [p.id, p]));
  const byId = new Map(PROTOCOLS.map((p) => [p.id, p]));
  const request = (): SubscribeRequest => ({
    ...emptyRequest(),
    commitment: commitment(),
    // An empty filter map means "nothing": the stream stays open and only pings flow.
    transactions: active.size ? { txs: txFilter({ accountInclude: [...active.values()].map((p) => p.programId) }) } : {},
  });

  const stream = runStream({
    request: request(),
    onUpdate: (update) => {
      const t = update.transaction;
      if (!t?.transaction) return;
      const tx = parseTx(t.transaction, t.slot);
      for (const p of active.values()) for (const trade of p.trades(tx)) console.log(tradeLine(trade, tx));
    },
  });
  onShutdown(async () => {
    stream.stop();
    await stream.done;
  });

  const show = () => console.log(`[filters] watching: ${[...active.keys()].join(", ") || "nothing"}`);
  show();
  console.log("[filters] type +venue or -venue, then Enter. Venues:", PROTOCOLS.map((p) => p.id).join(", "));
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    const op = line.trim()[0];
    const id = line.trim().slice(1);
    const p = byId.get(id);
    if ((op !== "+" && op !== "-") || !p) return console.log(`[filters] expected +venue or -venue, got "${line.trim()}"`);
    if (op === "+") active.set(id, p);
    else active.delete(id);
    stream.update(request());
    show();
  });
  await stream.done;
  input.close();
}
