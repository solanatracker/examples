import type { DcaListParams, DcaOrder, DcaStreamEvent, DcaTransactionEvent } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, run } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compactUsd, short, table, time, usd } from "./format.js";
import {
  ORDER_HEADERS,
  SORTS,
  STATUSES,
  callDca,
  formatUnits,
  frequencyLabel,
  isAddress,
  isOneOf,
  orderRow,
  tokenFor,
} from "./dca.js";

// ---- Configuration ---------------------------------------------------------
const client = createDataApiClient(); // validates ST_API_KEY first
const mint = optionalEnv("TOKEN_MINT") ?? "So11111111111111111111111111111111111111112";
const wallet = optionalEnv("WALLET_ADDRESS");
const sideEnv = optionalEnv("SIDE") ?? "both";
const statusEnv = optionalEnv("STATUS") ?? "active";
const sortEnv = optionalEnv("SORT") ?? "volume";
const pageLimit = numberEnv("PAGE_LIMIT", 100);
const maxPages = numberEnv("MAX_PAGES", 2);

if (!isAddress(mint)) fail(`TOKEN_MINT is not a valid Solana address: "${mint}"`);
if (wallet && !isAddress(wallet)) fail(`WALLET_ADDRESS is not a valid Solana address: "${wallet}"`);
if (!isOneOf(["buyers", "sellers", "both"] as const, sideEnv)) fail("SIDE must be buyers, sellers or both");
if (!isOneOf(STATUSES, statusEnv)) fail(`STATUS must be one of: ${STATUSES.join(", ")}`);
if (!isOneOf(SORTS, sortEnv)) fail(`SORT must be one of: ${SORTS.join(", ")}`);
if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 1000) fail("PAGE_LIMIT must be an integer from 1 to 1000");
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) fail("MAX_PAGES must be an integer from 1 to 10");

type Side = "buyers" | "sellers";
const sides: Side[] = sideEnv === "both" ? ["buyers", "sellers"] : [sideEnv];
const listParams: DcaListParams = { program: "jupiter", status: statusEnv, sort: sortEnv, limit: pageLimit };

/** Current order state, keyed by DCA account address. REST seeds it; position snapshots replace entries. */
const orders = new Map<string, DcaOrder>();

// ---- 1. REST: flow overview, then orders per side ---------------------------
async function loadSide(side: Side): Promise<{ loaded: DcaOrder[]; total: number }> {
  const loaded: DcaOrder[] = [];
  let cursor: string | undefined;
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    // Keep program, status and sort identical across pages: the cursor is only valid with them.
    const params = { ...listParams, cursor };
    const res = await callDca(`DCA ${side}`, () =>
      side === "buyers" ? client.getDcaTokenBuyers(mint, params) : client.getDcaTokenSellers(mint, params),
    );
    loaded.push(...res.orders);
    total = res.pagination.total;
    if (!res.pagination.hasMore || !res.pagination.nextCursor) break;
    cursor = res.pagination.nextCursor;
  }
  for (const order of loaded) orders.set(order.address, order);
  return { loaded, total };
}

function printSide(side: Side, loaded: DcaOrder[], total: number): void {
  const label = side === "buyers" ? "buying" : "selling";
  console.log(`\n${loaded.length} of ${total} ${statusEnv} orders ${label} ${short(mint)} (sorted by ${sortEnv})\n`);
  if (loaded.length === 0) return;
  table(ORDER_HEADERS, loaded.slice(0, 15).map(orderRow));
  if (loaded.length > 15) console.log(`… ${loaded.length - 15} more not shown`);

  // Remaining input is a balance the owner can still withdraw, not committed flow.
  const priced = loaded.filter((o) => typeof o.remainingUsd === "number");
  const remainingUsd = priced.reduce((sum, o) => sum + (o.remainingUsd ?? 0), 0);
  console.log(
    `Remaining input on loaded orders: ${compactUsd(remainingUsd)} across ${priced.length} priced orders` +
      (priced.length < loaded.length ? ` (${loaded.length - priced.length} without a USD price)` : ""),
  );
}

async function printWallet(address: string): Promise<void> {
  const res = await callDca("DCA wallet", () => client.getDcaWallet(address, { program: "jupiter", status: "all", limit: 50 }));
  const s = res.summary;
  console.log(
    `\nWallet ${short(address)}: ${s.total} orders (${s.active} active, ${s.pending} pending, ${s.paused} paused, ${s.completed} completed)\n`,
  );
  if (res.orders.length > 0) table(ORDER_HEADERS, res.orders.slice(0, 15).map(orderRow));
}

async function snapshot(): Promise<void> {
  const flow = await callDca("DCA flow", () => client.getDcaTokenFlow(mint));
  console.log(`DCA flow for ${short(mint)} (Jupiter recurring orders)`);
  console.log(`  Buyers:  ${flow.buyers.count} orders, volume ${usd(flow.buyers.volumeUsd)}`);
  console.log(`  Sellers: ${flow.sellers.count} orders, volume ${usd(flow.sellers.volumeUsd)}`);
  for (const side of sides) {
    const { loaded, total } = await loadSide(side);
    printSide(side, loaded, total);
  }
  if (wallet) await printWallet(wallet);
}

// ---- 2. Datastream: live DCA events for this token -------------------------
function describeEvent(event: DcaTransactionEvent): string {
  const owner = short(event.owner);
  switch (event.eventName) {
    case "Filled": {
      const inTok = tokenFor(event, event.inputMint);
      const outTok = tokenFor(event, event.outputMint);
      return (
        `FILLED   ${formatUnits(event.inAmount, inTok?.decimals)} ${inTok?.symbol ?? short(event.inputMint)} → ` +
        `${formatUnits(event.outAmount, outTok?.decimals)} ${outTok?.symbol ?? short(event.outputMint)}` +
        ` (${usd(event.usd.inAmountUsd)})  owner ${owner}`
      );
    }
    case "Opened": {
      const inTok = tokenFor(event, event.inputMint);
      return (
        `OPENED   ${formatUnits(event.inAmountPerCycle, inTok?.decimals)} ${inTok?.symbol ?? short(event.inputMint)}` +
        ` every ${frequencyLabel(event.cycleFrequency)}, deposited ${usd(event.usd.inDepositedUsd)}` +
        ` (${event.openInstruction})  owner ${owner}`
      );
    }
    case "Closed":
      return `CLOSED   ${event.userClosed ? "by owner" : "by program"}, unfilled ${usd(event.usd.unfilledAmountUsd)}  owner ${owner}`;
    case "Deposit":
      return `DEPOSIT  ${usd(event.usd.amountUsd)}  owner ${owner}`;
    case "Withdraw":
      return `WITHDRAW in ${usd(event.usd.inAmountUsd)}, out ${usd(event.usd.outAmountUsd)}  owner ${owner}`;
    case "CollectedFee":
      return `FEE      ${usd(event.usd.amountUsd)}  order ${short(event.address)}`;
  }
}

async function stream(): Promise<void> {
  const ds = createDatastream();
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  const lastWrite = new Map<string, { slot: number; writeVersion: number }>();
  let snapshots = 0;

  const handle = (side: Side) => (event: DcaStreamEvent) => {
    // Position updates are account snapshots: no signature, no eventName. Never count them as fills.
    if (!("eventName" in event)) {
      const prev = lastWrite.get(event.address);
      const newer =
        !prev || event.slot > prev.slot || (event.slot === prev.slot && event.writeVersion > prev.writeVersion);
      if (!newer) return; // stale or repeated snapshot
      lastWrite.set(event.address, { slot: event.slot, writeVersion: event.writeVersion });
      snapshots++;
      const before = orders.get(event.address);
      orders.set(event.address, event.order);
      if (before && before.status !== event.order.status) {
        console.log(`${time(event.timestamp)}  ${side.padEnd(7)}  STATUS   ${short(event.address)} ${before.status} → ${event.order.status}`);
      }
      return;
    }
    // Overlapping rooms (all, type, token, wallet, order) can deliver the same action twice.
    const key = `${event.signature}:${event.eventIndex}:${event.eventName}`;
    if (seen.has(key)) return;
    seen.add(key);
    seenOrder.push(key);
    if (seenOrder.length > 5_000) seen.delete(seenOrder.shift() as string);
    console.log(`${time(event.timestamp)}  ${side.padEnd(7)}  ${describeEvent(event)}  tx ${short(event.signature, 6)}`);
  };

  const subs = sides.map((side) => {
    const sub = side === "buyers" ? ds.subscribe.dca.token(mint).buyers() : ds.subscribe.dca.token(mint).sellers();
    return { room: sub.room, listener: sub.on(handle(side)) };
  });

  // After a reconnect the SDK rejoins the rooms, but events sent during the gap are not replayed.
  // Re-read order state from REST so remaining/used/progress are correct again.
  let connections = 0;
  ds.on("connected", () => {
    connections++;
    if (connections === 1) return;
    void (async () => {
      try {
        for (const side of sides) await loadSide(side);
        console.log(`[resync] order state refreshed from REST (${orders.size} orders tracked)`);
      } catch (error) {
        console.warn(`[resync] skipped: ${describeError(error)}`);
      }
    })();
  });

  const stats = setInterval(() => {
    console.log(`[state] ${orders.size} orders tracked, ${snapshots} position snapshots applied`);
  }, 60_000);

  console.log(`\nStreaming ${subs.map((s) => s.room).join(" and ")} — Ctrl+C to stop\n`);
  onShutdown(() => {
    clearInterval(stats);
    for (const { room, listener } of subs) {
      listener.unsubscribe(); // remove the callback
      ds.unsubscribe(room); // leave the server room
    }
    ds.disconnect();
    console.log("\nStopped.");
  });
}

run(async () => {
  await snapshot();
  if (!optionalEnv("ST_DATASTREAM_KEY")) {
    console.log(
      "\nNote: ST_DATASTREAM_KEY is not set, so the live part was skipped. " +
        "Add your Datastream key (Premium plan or higher) to stream fills, opens and closes.",
    );
    return;
  }
  await stream();
});
