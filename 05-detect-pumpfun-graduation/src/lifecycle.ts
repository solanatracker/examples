import type { PoolInfo, TokenInfo } from "@solana-tracker/data-api";

/** Fields shared by Datastream curve/graduated messages and REST graduated rows. */
export type TokenLike = { token: TokenInfo; pools: PoolInfo[] };

export type Watch = {
  symbol: string;
  curvePercent: number | undefined;
  seenAt: number;
};

/**
 * Why we believe a graduated token came from Pump.fun, strongest evidence first.
 * The `graduated` room spans every launchpad, so a filter is required.
 */
export function pumpfunEvidence(item: TokenLike, watchlist: Map<string, Watch>): string | undefined {
  if (watchlist.has(item.token.mint)) return "watched";
  if (item.pools?.some((p) => p.market === "pumpfun")) return "curve pool";
  if (typeof item.token.createdOn === "string" && item.token.createdOn.includes("pump.fun")) return "createdOn";
  // Weakest signal: PumpSwap pools can also be created for tokens that never used the curve.
  if (item.pools?.some((p) => p.market === "pumpfun-amm")) return "pumpswap pool";
  return undefined;
}

/**
 * The post-migration pool: never the curve pool. Prefers a pool carrying creation data
 * (present on new/graduated pool messages), then the deepest remaining pool.
 */
export function destinationPool(item: TokenLike): PoolInfo | undefined {
  const candidates = (item.pools ?? []).filter((p) => p.market !== "pumpfun");
  const created = candidates.find((p) => p.creation);
  if (created) return created;
  return [...candidates].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

export function curvePool(item: TokenLike): PoolInfo | undefined {
  return item.pools?.find((p) => p.market === "pumpfun");
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
