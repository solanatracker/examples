import type { PnlV2WalletQueued } from "@solana-tracker/data-api";
import { withRetry } from "./client.js";
import { time } from "./format.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isQueued(value: object): value is PnlV2WalletQueued {
  return "queued" in value && (value as PnlV2WalletQueued).queued === true;
}

/**
 * Calls a PnL v2 wallet method until it returns analytics instead of a queued placeholder.
 * Backoff: 5s, 10s, 20s, 40s, then 60s, until maxWaitMs. Returns null if still queued at the deadline.
 * Transport errors (429, 5xx, timeouts) are retried separately by withRetry.
 */
export async function pollUntilReady<T extends object>(
  label: string,
  call: () => Promise<T | PnlV2WalletQueued>,
  maxWaitMs: number,
): Promise<T | null> {
  const deadline = Date.now() + maxWaitMs;
  for (let attempt = 0; ; attempt++) {
    const result = await withRetry(label, call);
    if (!isQueued(result)) return result;
    const delay = Math.min(60_000, 5_000 * 2 ** attempt);
    if (Date.now() + delay > deadline) return null;
    console.log(`${time()}  ${label}: queued (${result.message}); checking again in ${delay / 1000}s`);
    await sleep(delay);
  }
}
