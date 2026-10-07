import type { LiquidityEvent } from "@solana-tracker/data-api";
import { short } from "./format.js";

/** Base58 public key shape check (32-44 chars, no 0/O/I/l). */
export function isAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

/** "2026-10-07 14:03:11" in UTC. `time` on LP events is Unix milliseconds. */
export function dateTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/** "+123.45 6p6x…iGPN, +9.0 So11…1112" using the exact decimal strings from the API. */
export function describeTokens(event: LiquidityEvent): string {
  const sign = event.type === "add_liquidity" ? "+" : "-";
  return event.tokens.map((t) => `${sign}${t.amount} ${short(t.address)}`).join(", ");
}

export function label(event: LiquidityEvent): string {
  return event.identity?.name ?? short(event.wallet);
}

/**
 * Matching key for live-vs-REST reconciliation. NOT a dedupe key:
 * several distinct LP actions can share a signature, pool and wallet, so keys
 * are counted (multiset), never collapsed. Time is excluded because live events
 * use processed time and REST uses canonical block time.
 */
export function matchKey(event: LiquidityEvent): string {
  const tokens = event.tokens
    .map((t) => `${t.address}:${t.amountRaw}`)
    .sort()
    .join(",");
  return [event.tx, event.type, event.pool, event.wallet, tokens].join("|");
}

/** Multiset of keys: add() counts occurrences, take() consumes one. */
export class KeyBag {
  private counts = new Map<string, number>();
  add(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  take(key: string): boolean {
    const n = this.counts.get(key) ?? 0;
    if (n === 0) return false;
    if (n === 1) this.counts.delete(key);
    else this.counts.set(key, n - 1);
    return true;
  }
}

/** Formats a raw integer amount (BigInt) with the token's decimals, without floating point. */
export function formatRaw(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  const fraction = decimals > 0 ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : "+"}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Net token flow into pools (adds minus removes) per mint, summed exactly from amountRaw. */
export function netFlow(events: LiquidityEvent[]): Map<string, { raw: bigint; decimals: number }> {
  const totals = new Map<string, { raw: bigint; decimals: number }>();
  for (const event of events) {
    const sign = event.type === "add_liquidity" ? 1n : -1n;
    for (const token of event.tokens) {
      const entry = totals.get(token.address) ?? { raw: 0n, decimals: token.decimals };
      entry.raw += sign * BigInt(token.amountRaw);
      totals.set(token.address, entry);
    }
  }
  return totals;
}
