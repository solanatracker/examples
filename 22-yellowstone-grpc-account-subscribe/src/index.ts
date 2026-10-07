import bs58 from "bs58";
import type { SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { fail, optionalEnv } from "./env.js";
import { short, time } from "./format.js";
import { emptyRequest, runStream } from "./grpc.js";
import { rpc } from "./rpc.js";
import { onShutdown } from "./shutdown.js";
import { columns, commitmentFromEnv } from "./stream-options.js";
import {
  OWNER_OFFSET,
  TOKEN_2022_PROGRAM,
  TOKEN_ACCOUNT_SIZE,
  TOKEN_PROGRAM,
  decodeTokenAccount,
  formatAmount,
} from "./token-account.js";

const DEFAULT_WALLET = "FbMxP3GVq8TQ36nbYgx4NP9iygMpwAwFWJwW81ioCiSF";

const wallet = optionalEnv("WALLET_ADDRESS") ?? DEFAULT_WALLET;
if (!isAddress(wallet)) fail(`WALLET_ADDRESS is not a base58 Solana address: "${wallet}"`);
const rpcUrl = optionalEnv("SOLANA_RPC_URL");
if (rpcUrl && !/^https?:\/\//.test(rpcUrl)) fail(`SOLANA_RPC_URL must start with https://, got "${rpcUrl}"`);
const commitment = commitmentFromEnv("confirmed");

type Asset = "SOL" | "SPL" | "T22";
type Balance = { asset: Asset; mint: string; amount: bigint; slot: bigint; writeVersion: bigint };
type Source = "grpc" | "rpc";

/** Latest known balance per account address: the wallet itself (SOL) and each of its token accounts. */
const balances = new Map<string, Balance>();
const decimalsCache = new Map<string, Promise<number | undefined>>([["SOL", Promise.resolve(9)]]);
const stats = { updates: 0, changes: 0, stale: 0, discovered: 0, closed: 0, backfilled: 0 };

const feed = columns([
  ["time", 8],
  ["slot", 11],
  ["event", 8],
  ["asset", 5],
  ["mint", 11],
  ["balance", 20],
  ["change", 20],
  ["signature", 13],
]);

/** Builds the full filter set. Every write replaces the previous one, so this always returns all of it. */
function buildRequest(): SubscribeRequest {
  const request = emptyRequest();
  request.commitment = commitment.level;
  request.accounts = {
    // The wallet account itself: lamports change on every SOL transfer and fee.
    wallet: { account: [wallet], owner: [], filters: [] },
    // Classic SPL token accounts owned by the wallet: fixed 165-byte layout, owner at byte 32.
    spl: {
      account: [],
      owner: [TOKEN_PROGRAM],
      filters: [{ datasize: String(TOKEN_ACCOUNT_SIZE) }, { memcmp: { offset: String(OWNER_OFFSET), base58: wallet } }],
    },
    // Token-2022 accounts vary in size (extensions), so match the account state instead of a data size.
    token2022: {
      account: [],
      owner: [TOKEN_2022_PROGRAM],
      filters: [{ tokenAccountState: true }, { memcmp: { offset: String(OWNER_OFFSET), base58: wallet } }],
    },
  };
  // A closed account has empty data and no longer matches memcmp. Watch known token accounts by address to see it close.
  const known = [...balances.keys()].filter((address) => address !== wallet);
  if (known.length > 0) request.accounts.known = { account: known, owner: [], filters: [] };
  return request;
}

let resubscribeTimer: NodeJS.Timeout | undefined;
/** Debounced: a burst of new token accounts costs one filter update. */
function scheduleResubscribe(): void {
  if (resubscribeTimer) return;
  resubscribeTimer = setTimeout(() => {
    resubscribeTimer = undefined;
    stream.update(buildRequest());
  }, 500);
}

function onUpdate(update: SubscribeUpdate): void {
  const info = update.account?.account;
  if (!update.account || !info) return;
  stats.updates++;

  const address = bs58.encode(info.pubkey);
  const owner = bs58.encode(info.owner);
  const slot = BigInt(update.account.slot); // u64 values arrive as strings
  const writeVersion = BigInt(info.writeVersion);
  const signature = info.txnSignature ? bs58.encode(info.txnSignature) : "";

  if (address === wallet) {
    record(address, { asset: "SOL", mint: "SOL", amount: BigInt(info.lamports), slot, writeVersion }, "grpc", signature);
    return;
  }

  const prev = balances.get(address);
  if (owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) {
    const token = decodeTokenAccount(info.data);
    if (token && token.owner === wallet) {
      const asset: Asset = owner === TOKEN_PROGRAM ? "SPL" : "T22";
      record(address, { asset, mint: token.mint, amount: token.amount, slot, writeVersion }, "grpc", signature);
      return;
    }
  }
  // Closed (zero lamports, empty data, system-owned) or ownership moved to another wallet.
  if (prev && isNewer(prev, slot, writeVersion)) close(address, prev, slot, signature);
}

function isNewer(prev: Balance, slot: bigint, writeVersion: bigint): boolean {
  return slot > prev.slot || (slot === prev.slot && writeVersion > prev.writeVersion);
}

function record(address: string, next: Balance, source: Source, signature = ""): void {
  const prev = balances.get(address);
  // Reconnects and RPC snapshots overlap with the stream: keep only strictly newer state.
  if (prev && !isNewer(prev, next.slot, next.writeVersion)) {
    stats.stale++;
    return;
  }
  balances.set(address, next);

  if (!prev) {
    if (next.asset !== "SOL") scheduleResubscribe();
    if (source === "rpc") return; // the snapshot is summarised in one line, not printed row by row
    if (next.asset !== "SOL") stats.discovered++;
    emit("seen", next, undefined, signature);
    return;
  }
  if (prev.amount === next.amount) return; // e.g. a delegate or close-authority change
  if (source === "rpc") stats.backfilled++;
  else stats.changes++;
  emit(source === "rpc" ? "backfill" : "change", next, next.amount - prev.amount, signature);
}

function close(address: string, prev: Balance, slot: bigint, signature: string): void {
  balances.delete(address);
  stats.closed++;
  emit("closed", { ...prev, amount: 0n, slot }, -prev.amount, signature);
  scheduleResubscribe();
}

function emit(event: string, balance: Balance, delta: bigint | undefined, signature: string): void {
  const at = Date.now();
  void decimalsFor(balance.mint).then((decimals) =>
    feed.row([
      time(at),
      balance.slot.toString(),
      event,
      balance.asset,
      balance.asset === "SOL" ? "" : short(balance.mint, 4),
      formatAmount(balance.amount, decimals),
      delta === undefined ? "" : formatAmount(delta, decimals, true),
      signature ? short(signature, 5) : "",
    ]),
  );
}

/** Token accounts do not store decimals. Read byte 44 of the mint once per mint (needs SOLANA_RPC_URL). */
function decimalsFor(mint: string): Promise<number | undefined> {
  let cached = decimalsCache.get(mint);
  if (!cached) {
    cached = fetchDecimals(mint);
    decimalsCache.set(mint, cached);
  }
  return cached;
}

async function fetchDecimals(mint: string): Promise<number | undefined> {
  if (!rpcUrl) return undefined;
  try {
    const result = await rpc<{ value: { data: [string, string] } | null }>(rpcUrl, "getAccountInfo", [
      mint,
      { encoding: "base64", dataSlice: { offset: 44, length: 1 } },
    ]);
    const encoded = result.value?.data[0];
    return encoded ? Buffer.from(encoded, "base64")[0] : undefined;
  } catch {
    decimalsCache.delete(mint); // retry on the next row instead of caching the failure
    return undefined;
  }
}

type WithContext<T> = { context: { slot: number }; value: T };
type ParsedTokenAccount = {
  pubkey: string;
  account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } };
};

/**
 * Snapshot over RPC on first connect, and again after every reconnect to cover the gap.
 * Stream state at a later slot always wins over the snapshot.
 */
async function snapshot(reconnect: boolean): Promise<void> {
  if (!rpcUrl) return;
  const label = reconnect ? "backfill after reconnect" : "snapshot";
  try {
    const config = { commitment: commitment.name };
    const [sol, spl, t22] = await Promise.all([
      rpc<WithContext<number>>(rpcUrl, "getBalance", [wallet, config]),
      rpc<WithContext<ParsedTokenAccount[]>>(rpcUrl, "getTokenAccountsByOwner", [
        wallet,
        { programId: TOKEN_PROGRAM },
        { ...config, encoding: "jsonParsed" },
      ]),
      rpc<WithContext<ParsedTokenAccount[]>>(rpcUrl, "getTokenAccountsByOwner", [
        wallet,
        { programId: TOKEN_2022_PROGRAM },
        { ...config, encoding: "jsonParsed" },
      ]),
    ]);
    record(wallet, { asset: "SOL", mint: "SOL", amount: BigInt(sol.value), slot: BigInt(sol.context.slot), writeVersion: 0n }, "rpc");
    for (const [asset, list] of [["SPL", spl], ["T22", t22]] as const) {
      for (const row of list.value) {
        const { mint, tokenAmount } = row.account.data.parsed.info;
        if (!decimalsCache.has(mint)) decimalsCache.set(mint, Promise.resolve(tokenAmount.decimals));
        const slot = BigInt(list.context.slot);
        record(row.pubkey, { asset, mint, amount: BigInt(tokenAmount.amount), slot, writeVersion: 0n }, "rpc");
      }
    }
    console.log(
      `[rpc] ${label}: ${formatAmount(BigInt(sol.value), 9)} SOL, ${spl.value.length} SPL + ${t22.value.length} Token-2022 accounts at slot ${sol.context.slot}`,
    );
  } catch (err) {
    console.warn(`[rpc] ${label} failed: ${err instanceof Error ? err.message : err}; continuing with the stream only`);
  }
}

function isAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

// runStream validates YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN before anything is printed.
const stream = runStream({
  request: buildRequest(),
  onUpdate,
  onConnect: (reconnect) => void snapshot(reconnect),
});
console.log(`Watching ${short(wallet, 6)} (SOL, SPL Token, Token-2022) at ${commitment.name} commitment. Ctrl+C to stop.`);
if (!rpcUrl) console.log("SOLANA_RPC_URL not set: no starting snapshot, and amounts for new mints print in raw base units.");
console.log("");
feed.header();

onShutdown(async () => {
  clearTimeout(resubscribeTimer);
  stream.stop();
  // done can be mid-backoff; do not hold Ctrl+C hostage to a reconnect timer.
  await Promise.race([stream.done, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  const tokens = [...balances.values()].filter((b) => b.asset !== "SOL").length;
  console.log(
    `\nStopped. updates=${stats.updates} changes=${stats.changes} backfilled=${stats.backfilled} discovered=${stats.discovered} closed=${stats.closed} stale=${stats.stale} token accounts=${tokens}`,
  );
});
