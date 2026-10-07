import type { BundlersResponse, PnlV2Holder, TokenDetailResponse } from "@solana-tracker/data-api";

export const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Wallet sets from the token's risk block and the bundlers endpoint. */
export type RiskSets = { snipers: Set<string>; insiders: Set<string>; bundlers: Set<string> };

export function riskSets(info: TokenDetailResponse | undefined, bundlers: BundlersResponse | undefined): RiskSets {
  // RiskWallet exposes `wallet` (wire field) and the legacy `address` alias.
  const wallets = (list?: Array<{ wallet?: string; address: string }>) =>
    new Set((list ?? []).map((w) => w.wallet ?? w.address).filter(Boolean));
  return {
    snipers: wallets(info?.risk?.snipers?.wallets),
    insiders: wallets(info?.risk?.insiders?.wallets),
    bundlers: new Set((bundlers?.wallets ?? []).map((w) => w.wallet)),
  };
}

/** Short flags: S = in risk.snipers, I = in risk.insiders, B = in the bundlers list. */
export function flags(wallet: string, sets: RiskSets): string {
  return [sets.snipers.has(wallet) ? "S" : "", sets.insiders.has(wallet) ? "I" : "", sets.bundlers.has(wallet) ? "B" : ""].join("") || "-";
}

export type Outcome = "holding" | "exited +" | "exited -" | "exited 0" | "moved out" | "unknown";

/** Position state from token-scoped fields only. Null stays unknown, never zero. */
export function outcome(t: PnlV2Holder): Outcome {
  const balance = t.current?.balance ?? t.position?.balance;
  if (balance === null || balance === undefined) return "unknown";
  if (balance > 0) return "holding";
  // Zero balance with no sells: the tokens left by transfer, so token PnL says little.
  if ((t.counts?.sells ?? 0) === 0) return "moved out";
  const realized = t.pnl?.token?.realized;
  if (realized === null || realized === undefined) return "unknown";
  return realized > 0 ? "exited +" : realized < 0 ? "exited -" : "exited 0";
}

export function label(t: PnlV2Holder): string {
  const id = t.identity;
  if (!id) return "";
  return id.name || id.type || id.tags?.[0] || "";
}

export type Summary = {
  rows: number;
  holding: number;
  exitedProfit: number;
  exitedLoss: number;
  movedOut: number;
  quickFlips: number;
  flagged: number;
  invested: number;
  tokenPnl: number;
};

/** Aggregates over the returned page. Quick flip: exited within QUICK_FLIP_SECONDS of the first trade. */
export function summarize(traders: PnlV2Holder[], sets: RiskSets, quickFlipSeconds: number): Summary {
  const s: Summary = { rows: traders.length, holding: 0, exitedProfit: 0, exitedLoss: 0, movedOut: 0, quickFlips: 0, flagged: 0, invested: 0, tokenPnl: 0 };
  for (const t of traders) {
    const state = outcome(t);
    if (state === "holding") s.holding++;
    if (state === "exited +") s.exitedProfit++;
    if (state === "exited -") s.exitedLoss++;
    if (state === "moved out") s.movedOut++;
    const first = t.timing?.firstTrade;
    const last = t.timing?.lastSell ?? t.timing?.lastTrade;
    if (state.startsWith("exited") && first && last && (last - first) / 1000 <= quickFlipSeconds) s.quickFlips++;
    if (flags(t.wallet, sets) !== "-") s.flagged++;
    s.invested += t.invested ?? 0;
    s.tokenPnl += t.pnl?.token?.total ?? 0;
  }
  return s;
}

export function holdFor(t: PnlV2Holder): string {
  const secs = t.timing?.holdTimeSecs;
  if (secs === null || secs === undefined) return "n/a";
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86_400) return `${(secs / 3600).toFixed(1)}h`;
  return `${(secs / 86_400).toFixed(1)}d`;
}

export function dateTime(ms: number | null | undefined): string {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString().slice(5, 19).replace("T", " ") : "n/a";
}
