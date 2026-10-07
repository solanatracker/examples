import { DataApiError } from "@solana-tracker/data-api";
import type { DcaOrder, DcaOrderStatusFilter, DcaSort, DcaToken, DcaTransactionEvent } from "@solana-tracker/data-api";
import { withRetry } from "./client.js";
import { compact, short } from "./format.js";

export const STATUSES = ["active", "paused", "completed", "pending", "all"] as const satisfies readonly DcaOrderStatusFilter[];
export const SORTS = ["volume", "deposited", "remaining", "progress", "recent", "created", "status"] as const satisfies readonly DcaSort[];

export function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** Base58 public key shape check (32-44 chars, no 0/O/I/l). */
export function isAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token-level DCA endpoints can answer 408 when the server-side query times out.
 * The shared withRetry() only retries 429, 5xx and network errors, so 408 gets
 * its own short, bounded retry here.
 */
export async function callDca<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withRetry(label, fn, { timeoutMs: 20_000 });
    } catch (error) {
      const serverTimeout = error instanceof DataApiError && error.status === 408;
      if (!serverTimeout || attempt >= 3) throw error;
      const delay = 1_500 * attempt;
      console.warn(`${label}: server timeout (408), retry ${attempt}/2 in ${delay} ms`);
      await sleep(delay);
    }
  }
}

/** "in 14m", "due", or "-" for an ISO nextCycleAt value. */
export function nextCycle(iso: string | null): string {
  if (!iso) return "-";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "-";
  if (ms <= 0) return "due";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
}

/** Order row for the REST tables. Amounts are in token units; USD may be null. */
export function orderRow(o: DcaOrder): string[] {
  return [
    short(o.owner),
    o.pair,
    o.status,
    `${compact(o.perCycle)} ${o.input.symbol}`,
    o.frequency,
    `${o.progressPercent.toFixed(0)}%`,
    `${compact(o.remaining)} ${o.input.symbol}`,
    nextCycle(o.nextCycleAt),
  ];
}

export const ORDER_HEADERS = ["Owner", "Pair", "Status", "Per cycle", "Every", "Done", "Remaining", "Next"];

/** Formats a base-unit string with decimals, without floating point. */
export function formatUnits(raw: string, decimals: number | undefined): string {
  if (decimals === undefined || !/^\d+$/.test(raw)) return `${raw} (raw)`;
  const digits = raw.padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction.slice(0, 6)}` : whole;
}

/** Token metadata for a mint, taken from the order snapshot on the event when present. */
export function tokenFor(event: DcaTransactionEvent, mint: string): Pick<DcaToken, "symbol" | "decimals"> | undefined {
  const { input, output } = event.order ?? {};
  if (input?.mint === mint) return input;
  if (output?.mint === mint) return output;
  return undefined;
}

/** "3600" seconds -> "1h". */
export function frequencyLabel(seconds: string): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return `${seconds}s`;
  if (s % 86_400 === 0) return `${s / 86_400}d`;
  if (s % 3_600 === 0) return `${s / 3_600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}
