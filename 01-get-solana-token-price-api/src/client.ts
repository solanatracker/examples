import { Client, DataApiError, RateLimitError, ValidationError } from "@solana-tracker/data-api";
import { optionalEnv, requireApiKey } from "./env.js";

export function createDataApiClient(): Client {
  const baseUrl = optionalEnv("DATA_API_BASE_URL");
  return new Client({ apiKey: requireApiKey(), ...(baseUrl ? { baseUrl } : {}) });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  /** Attempts including the first call. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt timeout. The SDK has no request timeout of its own. */
  timeoutMs?: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ValidationError) return false;
  if (error instanceof RateLimitError) return true;
  if (error instanceof DataApiError) return error.status === undefined || error.status >= 500;
  return true; // network errors and timeouts
}

/**
 * Calls a Data API method with a per-attempt timeout and capped exponential backoff.
 * Honors RateLimitError.retryAfter (seconds). The SDK does not retry on its own.
 */
export async function withRetry<T>(label: string, fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseDelayMs = 500, maxDelayMs = 8_000, timeoutMs = 15_000 } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const retryAfterMs = error instanceof RateLimitError && error.retryAfter ? error.retryAfter * 1000 : 0;
      const delay = Math.max(backoff, retryAfterMs) * (0.8 + Math.random() * 0.4);
      console.warn(`${label} failed (${describeError(error)}); retry ${attempt}/${attempts - 1} in ${Math.round(delay)} ms`);
      await sleep(delay);
    }
  }
}

export function describeError(error: unknown): string {
  if (error instanceof RateLimitError) return `rate limited${error.retryAfter ? `, retry after ${error.retryAfter}s` : ""}`;
  if (error instanceof ValidationError) return `invalid request: ${error.message}`;
  if (error instanceof DataApiError) {
    if (error.status === 401 || error.status === 403) return `HTTP ${error.status}: check ST_API_KEY and your plan`;
    return `HTTP ${error.status ?? "?"}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Top-level runner: prints a readable error instead of a stack trace and sets the exit code. */
export function run(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(`\nError: ${describeError(error)}`);
    process.exitCode = 1;
  });
}
