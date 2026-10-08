import { optionalEnv } from "./env.js";

/** The /raptor product page lists this host; the docs examples use raptor-beta.solanatracker.io. Both serve the same API. */
export const DEFAULT_RAPTOR_URL = "https://raptor.solanatracker.io";

export type RouteStep = {
  programId: string;
  dex: string;
  pool: string;
  inputMint: string;
  outputMint: string;
  amountIn: string;
  amountOut: string;
  feeAmount?: string;
  priceImpact?: number;
  /** Share of the input routed through this step (a split route has several steps with the same hop). */
  percent: number;
};

export type QuoteResponse = {
  inputMint: string;
  outputMint: string;
  /** Amounts are base units as decimal strings; parse with BigInt, never Number. */
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  feeAmount?: string;
  priceImpact?: number;
  /** Resolved slippage. With slippageBps=dynamic this is the value the router chose. */
  slippageBps: number;
  routePlan: RouteStep[];
  swapUsdValue?: string;
  platformFee?: { feeBps: number; feeAccount?: string; feeFromInput?: boolean; chargeBps?: number };
  contextSlot: number;
  timeTaken: number;
  /** Undocumented fields (quoteId, searchMode, ...) must travel back to /swap untouched. */
  [key: string]: unknown;
};

export type QuoteParams = {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps?: number | "dynamic";
  maxHops?: number;
  dexes?: string;
  feeBps?: number;
  feeAccount?: string;
  feeFromInput?: boolean;
};

/** Documented levels: min, low, auto, medium, high, veryHigh, turbo, unsafeMax. Must be a string; a bare number is rejected. */
export type PriorityFee = string;

export type SwapRequest = {
  userPublicKey: string;
  quoteResponse: QuoteResponse;
  txVersion?: "V0" | "LEGACY";
  wrapUnwrapSol?: boolean;
  priorityFee?: PriorityFee;
  maxPriorityFee?: number;
  computeUnitPriceMicroLamports?: number;
  computeUnitLimit?: number;
  tipAccount?: string;
  tipLamports?: number;
  feeAccount?: string;
  feeBps?: number;
  feeFromInput?: boolean;
  chargeBps?: number;
};

export type SwapResponse = {
  /** Base64 serialized transaction, unsigned. */
  swapTransaction: string;
  lastValidBlockHeight: number;
  contextSlot?: number;
  prioritizationFeeLamports?: number;
};

export type SendResponse = {
  signature: string;
  signature_base64?: string;
  success: boolean;
};

export type TransactionStatusValue = "pending" | "confirmed" | "failed" | "expired";

export type TransactionStatus = {
  signature: string;
  status: TransactionStatusValue;
  slot?: number;
  sent_at: number;
  confirmed_at?: number;
  latency_ms?: number;
  error?: string;
  events?: { name: string; data?: string; parsed?: Record<string, unknown> }[];
};

export class RaptorError extends Error {
  constructor(
    readonly status: number | undefined,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RaptorError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 400 and 404 bodies are JSON ({ error, code }); 422 validation errors are plain text. Handle both. */
function errorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    const text = parsed.error ?? parsed.message;
    if (text) return `HTTP ${status}: ${text}`;
  } catch {
    // not JSON
  }
  const trimmed = body.trim().replace(/\s+/g, " ");
  return `HTTP ${status}${trimmed ? `: ${trimmed.slice(0, 200)}` : ""}`;
}

/**
 * Minimal Raptor HTTP client: per-request timeout, capped exponential backoff on
 * network errors, timeouts and 5xx. Sends are never retried here; a retry after
 * expiry needs a fresh quote and transaction, which is the caller's decision.
 */
export class RaptorClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = optionalEnv("RAPTOR_BASE_URL") ?? DEFAULT_RAPTOR_URL, timeoutMs = 15_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  quote(params: QuoteParams): Promise<QuoteResponse> {
    const query = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
    });
    if (params.slippageBps !== undefined) query.set("slippageBps", String(params.slippageBps));
    if (params.maxHops !== undefined) query.set("maxHops", String(params.maxHops));
    if (params.dexes) query.set("dexes", params.dexes);
    if (params.feeBps !== undefined) query.set("feeBps", String(params.feeBps));
    if (params.feeAccount) query.set("feeAccount", params.feeAccount);
    if (params.feeFromInput !== undefined) query.set("feeFromInput", String(params.feeFromInput));
    return this.request<QuoteResponse>("GET", `/quote?${query}`, undefined, 3);
  }

  buildSwap(body: SwapRequest): Promise<SwapResponse> {
    return this.request<SwapResponse>("POST", "/swap", body, 2);
  }

  /** Submits a signed, base64-encoded transaction through Yellowstone Jet TPU. */
  send(signedTransactionBase64: string): Promise<SendResponse> {
    return this.request<SendResponse>("POST", "/send-transaction", { transaction: signedTransactionBase64 }, 0);
  }

  status(signature: string): Promise<TransactionStatus> {
    return this.request<TransactionStatus>("GET", `/transaction/${signature}`, undefined, 3);
  }

  private async request<T>(method: "GET" | "POST", path: string, body: unknown, retries: number): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: body === undefined ? {} : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new RaptorError(response.status, errorMessage(response.status, text), response.status >= 500 || response.status === 429);
        }
        return JSON.parse(text) as T;
      } catch (error) {
        const retryable = error instanceof RaptorError ? error.retryable : true;
        if (!retryable || attempt >= retries) {
          if (error instanceof RaptorError) throw error;
          const reason = error instanceof Error ? error.message : String(error);
          throw new RaptorError(undefined, `${method} ${path.split("?")[0]} failed: ${reason}`, true);
        }
        const delay = Math.min(4_000, 400 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
        console.warn(`${method} ${path.split("?")[0]} failed (${error instanceof Error ? error.message : String(error)}); retry in ${Math.round(delay)} ms`);
        await sleep(delay);
      }
    }
  }
}
