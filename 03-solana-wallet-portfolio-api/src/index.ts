import type { WalletBalanceUpdate, WalletResponse, WalletTokenDetail } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, run, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compact, compactUsd, pct, short, table, time, usd } from "./format.js";

// REST /wallet lists native SOL under this id; the Datastream balance rooms report SOL as wrapped SOL.
const NATIVE_SOL = "So11111111111111111111111111111111111111111";
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_WALLET = "FbMxP3GVq8TQ36nbYgx4NP9iygMpwAwFWJwW81ioCiSF";

type Holding = {
  mint: string;
  symbol: string;
  balance: number;
  value: number;
  /** USD per token implied by the snapshot (value / balance). The balance stream carries no prices. */
  unitPrice: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  risk: number | null;
};

function toHolding(row: WalletTokenDetail): Holding {
  const topPool = [...(row.pools ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return {
    mint: row.token.mint,
    symbol: row.token.symbol || short(row.token.mint),
    balance: row.balance,
    value: row.value,
    unitPrice: row.balance > 0 ? row.value / row.balance : null,
    change24h: row.events?.["24h"]?.priceChangePercentage ?? null,
    liquidityUsd: topPool?.liquidity?.usd ?? null,
    risk: typeof row.risk?.score === "number" ? row.risk.score : null,
  };
}

function printSnapshot(wallet: string, snapshot: WalletResponse, minValueUsd: number): Map<string, Holding> {
  const holdings = snapshot.tokens.map(toHolding).sort((a, b) => b.value - a.value);
  const shown = holdings.filter((h) => h.value >= minValueUsd);
  const dust = holdings.length - shown.length;

  console.log(`\nPortfolio for ${wallet}${snapshot.timestamp ? ` (snapshot ${snapshot.timestamp})` : ""}\n`);
  table(
    ["Token", "Mint", "Balance", "Value", "Share", "24h", "Liquidity", "Risk"],
    shown.map((h) => [
      h.symbol.slice(0, 12),
      short(h.mint),
      compact(h.balance),
      usd(h.value),
      snapshot.total > 0 ? `${((h.value / snapshot.total) * 100).toFixed(1)}%` : "n/a",
      pct(h.change24h),
      compactUsd(h.liquidityUsd),
      h.risk === null ? "n/a" : String(h.risk),
    ]),
  );
  console.log(
    `\nTotal ${usd(snapshot.total)} (${snapshot.totalSol.toFixed(3)} SOL) across ${holdings.length} token(s)` +
      (dust > 0 ? `; ${dust} below ${usd(minValueUsd)} hidden` : ""),
  );
  return new Map(holdings.map((h) => [h.mint, h]));
}

async function main(): Promise<void> {
  const client = createDataApiClient();
  const wallet = optionalEnv("WALLET_ADDRESS") ?? DEFAULT_WALLET;
  if (!BASE58.test(wallet)) fail(`WALLET_ADDRESS is not a valid base58 address: "${wallet}"`);
  const minValueUsd = numberEnv("MIN_VALUE_USD", 1);
  const refreshSec = numberEnv("SNAPSHOT_REFRESH_SEC", 300);
  if (minValueUsd < 0) fail("MIN_VALUE_USD must be 0 or more");
  if (refreshSec < 30) fail("SNAPSHOT_REFRESH_SEC must be at least 30");

  const fetchSnapshot = () => withRetry("getWallet", () => client.getWallet(wallet), { timeoutMs: 20_000 });
  let holdings = printSnapshot(wallet, await fetchSnapshot(), minValueUsd);

  if (!optionalEnv("ST_DATASTREAM_KEY")) {
    console.log("\nSet ST_DATASTREAM_KEY (Premium plan or higher) to follow balance changes live.");
    return;
  }

  // Live mode: the balance room sends the new UI amount per token. Revalue it with the snapshot price,
  // and re-fetch the snapshot on reconnect, on unknown mints and on a timer (prices move, amounts don't tell you).
  let refreshTimer: NodeJS.Timeout | undefined;
  let refreshing = false;
  const refresh = (reason: string, delayMs = 3_000) => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const snapshot = await fetchSnapshot();
        holdings = new Map(snapshot.tokens.map(toHolding).map((h) => [h.mint, h]));
        console.log(`${time()}  snapshot refreshed (${reason}): ${usd(snapshot.total)} across ${holdings.size} token(s)`);
      } catch (error) {
        console.warn(`${time()}  snapshot refresh failed: ${describeError(error)}`);
      } finally {
        refreshing = false;
      }
    }, delayMs);
  };

  const estimatedTotal = () => [...holdings.values()].reduce((sum, h) => sum + h.value, 0);

  const ds = createDatastream();
  let connectedOnce = false;
  ds.on("connected", () => {
    if (connectedOnce) refresh("reconnected, updates may have been missed", 0);
    connectedOnce = true;
  });

  const listener = ds.subscribe
    .wallet(wallet)
    .balance()
    .on((update: WalletBalanceUpdate) => {
      const mint = update.token === WRAPPED_SOL && !holdings.has(WRAPPED_SOL) ? NATIVE_SOL : update.token;
      const known = holdings.get(mint);
      if (!known) {
        console.log(`${time()}  ${short(mint)}  new balance ${compact(update.amount)} (not in snapshot, refreshing)`);
        refresh("new token");
        return;
      }
      const before = known.balance;
      known.balance = update.amount;
      if (known.unitPrice !== null) known.value = update.amount * known.unitPrice;
      const delta = update.amount - before;
      console.log(
        `${time()}  ${known.symbol.padEnd(10)} ${delta >= 0 ? "+" : ""}${compact(delta)} -> ${compact(update.amount)}` +
          `  value ${known.unitPrice === null ? "n/a" : usd(known.value)}  est. total ${usd(estimatedTotal())}`,
      );
    });

  const timer = setInterval(() => refresh("scheduled", 0), refreshSec * 1000);
  console.log(`\nWatching ${short(wallet)} for balance changes. Ctrl+C to stop.`);

  onShutdown(() => {
    clearInterval(timer);
    clearTimeout(refreshTimer);
    listener.unsubscribe();
    ds.disconnect();
    console.log("Stopped.");
  });
}

run(main);
