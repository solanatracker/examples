import type { PoolInfo, TokenInfo, TokenRisk } from "@solana-tracker/data-api";

/**
 * The subset of fields shared by a Datastream `latest` message and a REST
 * `/tokens/latest` row. Both carry token metadata, every known pool and risk.
 */
export type LaunchLike = {
  token: TokenInfo;
  pools: PoolInfo[];
  risk?: TokenRisk;
};

export type Launch = {
  mint: string;
  symbol: string;
  pool: PoolInfo;
  creator: string | undefined;
  createdAtMs: number | undefined;
  riskScore: number | undefined;
};

/**
 * Returns the Pump.fun bonding-curve pool, or undefined when the message is for
 * another market. Search every pool: the first pool is not guaranteed to be the launch pool.
 */
export function pumpfunCurvePool(item: LaunchLike): PoolInfo | undefined {
  return item.pools?.find((pool) => pool.market === "pumpfun");
}

export function toLaunch(item: LaunchLike): Launch | undefined {
  const pool = pumpfunCurvePool(item);
  if (!pool || !item.token?.mint) return undefined;
  const createdSeconds = pool.creation?.created_time ?? item.token.creation?.created_time;
  return {
    mint: item.token.mint,
    symbol: item.token.symbol || item.token.name || "?",
    pool,
    creator: pool.deployer ?? pool.creation?.creator ?? item.token.creation?.creator,
    // pool.createdAt is unix ms; creation.created_time is unix seconds.
    createdAtMs: pool.createdAt ?? (createdSeconds ? createdSeconds * 1000 : undefined),
    riskScore: typeof item.risk?.score === "number" ? item.risk.score : undefined,
  };
}

/** Suppresses repeat alerts for the same mint within a time window. In-memory only. */
export class SeenMints {
  private readonly expiry = new Map<string, number>();
  constructor(private readonly ttlMs: number, private readonly maxSize = 50_000) {}

  /** Returns true the first time a mint is seen inside the window. */
  firstSighting(mint: string, now = Date.now()): boolean {
    const expires = this.expiry.get(mint);
    if (expires !== undefined && expires > now) return false;
    this.expiry.set(mint, now + this.ttlMs);
    if (this.expiry.size > this.maxSize) this.prune(now);
    return true;
  }

  prune(now = Date.now()): void {
    for (const [mint, expires] of this.expiry) if (expires <= now) this.expiry.delete(mint);
    // Still too big: drop the oldest insertions (Map keeps insertion order).
    for (const mint of this.expiry.keys()) {
      if (this.expiry.size <= this.maxSize) break;
      this.expiry.delete(mint);
    }
  }
}
