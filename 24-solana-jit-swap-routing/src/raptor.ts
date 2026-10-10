import { optionalEnv } from "./env.js";

/** Hosted Raptor V1. No API key; self-hosted binaries serve the same API. */
export const DEFAULT_RAPTOR_URL = "https://raptor.solanatracker.io";

/** `auto` (the server default) uses JIT when it improves execution, `true` always builds a JIT route, `false` never does. */
export type JitMode = "auto" | "true" | "false";

/** V0 and V1 carry JIT routes. LEGACY has no lookup tables, so quote it with jitRouting=false. Case-sensitive. */
export type TxVersion = "V0" | "V1" | "LEGACY";

export type RouteStep = {
  programId: string;
  dex: string;
  pool: string;
  inputMint: string;
  outputMint: string;
  amountIn: string;
  amountOut: string;
  priceImpact?: number;
  percent: number;
};

export type QuoteResponse = {
  inputMint: string;
  outputMint: string;
  /** Base units as decimal strings. Parse with BigInt. */
  amountIn: string;
  amountOut: string;
  /** The floor the on-chain program enforces, JIT or not. */
  minAmountOut: string;
  priceImpact?: number;
  slippageBps: number;
  routePlan: RouteStep[];
  swapUsdValue?: string;
  contextSlot: number;
  timeTaken: number;
  /** Present and true when the quote uses a just-in-time route. */
  jitRouting?: boolean;
  /** Points at a short-lived execution plan held by the API instance that quoted. */
  quoteId?: string;
  searchMode?: "fast" | "deep";
  /** Fields this type does not name still have to reach /swap untouched. */
  [key: string]: unknown;
};

export type QuoteParams = {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps?: number | "dynamic";
  jitRouting?: JitMode;
  /** `deep` searches more routes and takes longer. */
  searchMode?: "fast" | "deep";
};

export type BuildRequest = {
  userPublicKey: string;
  quoteResponse: QuoteResponse;
  txVersion?: TxVersion;
  wrapUnwrapSol?: boolean;
  /** A level: min, low, auto, medium, high, veryHigh, turbo or unsafeMax. */
  priorityFee?: string;
  /** An exact compute unit price instead of a level. */
  computeUnitPriceMicroLamports?: number;
  /**
   * On /swap, omitted or `auto` keeps the quote's route.
   * On /swap-instructions, only `true` returns a JIT swap; anything else returns an ordinary one you can CPI into.
   */
  jitRouting?: JitMode | boolean;
};

export type SwapResponse = {
  /** Base64, unsigned. */
  swapTransaction: string;
  lastValidBlockHeight: number;
  contextSlot?: number;
  prioritizationFeeLamports?: number;
  quoteResponse?: QuoteResponse;
};

export type AccountMeta = { pubkey: string; isSigner: boolean; isWritable: boolean };
export type WireInstruction = { programId: string; accounts: AccountMeta[]; data: string };

export type SwapInstructionsResponse = {
  computeBudgetInstructions: WireInstruction[];
  setupInstructions: WireInstruction[];
  swapInstruction: WireInstruction;
  cleanupInstruction: WireInstruction | null;
  tipInstruction?: WireInstruction | null;
  tokenLedgerInstruction?: WireInstruction | null;
  addressLookupTableAddresses: string[];
  /** True for a JIT swap: the swap must be the last instruction and must not be invoked through CPI. */
  topLevelOnly?: boolean;
  /** When present, use these amounts rather than the ones you sent. */
  quoteResponse?: QuoteResponse;
};

export type SendResponse = { signature: string; success: boolean };

export type TransactionStatus = {
  signature: string;
  status: "pending" | "confirmed" | "failed" | "expired";
  slot?: number;
  latency_ms?: number;
  error?: string;
  /** Program events once landed. `SwapEvent.parsed` holds the amounts actually traded. */
  events?: Array<{ name: string; parsed?: Record<string, unknown> }>;
};

/**
 * What a caller should do about a failure. The API mixes JSON and plain-text error bodies,
 * so this is decided from status and message together.
 */
export type FailureKind =
  /** 422 "No multi-hop route found": try another amount or fewer filters. */
  | "no-route"
  /** The quote's execution plan expired or the quote was edited: quote again, then build. */
  | "stale-quote"
  /** Any 4xx except 429, e.g. a 422 body that failed validation (txVersion "v0"): retrying the same request won't help. */
  | "bad-request"
  /** Network error, timeout, 429 or another 5xx: safe to retry with backoff. */
  | "transient";

export class RaptorError extends Error {
  readonly kind: FailureKind;

  constructor(
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "RaptorError";
    this.kind = classify(status, message);
  }
}

function classify(status: number | undefined, message: string): FailureKind {
  if (/no (multi-hop )?route/i.test(message)) return "no-route";
  // 500 "Execution plan expired" (seconds old) or 422 "Quote expired, modified or unavailable" (older, edited,
  // or sent to a different self-hosted instance than the one that quoted).
  if (/expired|modified or unavailable/i.test(message)) return "stale-quote";
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) return "bad-request";
  return "transient";
}

function errorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return `HTTP ${status}: ${parsed.error}`;
  } catch {
    // Plain-text body.
  }
  const text = body.trim().replace(/\s+/g, " ").replace(/^Failed to deserialize the JSON body into the target type: /, "");
  return `HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Raptor HTTP client. Retries only `transient` failures; sends are never retried. */
export class RaptorClient {
  readonly baseUrl: string;

  constructor(
    baseUrl = optionalEnv("RAPTOR_BASE_URL") ?? DEFAULT_RAPTOR_URL,
    private readonly timeoutMs = 15_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  quote(params: QuoteParams): Promise<QuoteResponse> {
    const query = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
    });
    if (params.slippageBps !== undefined) query.set("slippageBps", String(params.slippageBps));
    if (params.jitRouting) query.set("jitRouting", params.jitRouting);
    if (params.searchMode) query.set("searchMode", params.searchMode);
    return this.request("GET", `/quote?${query}`, undefined, 2);
  }

  /** The quote must reach /swap within a few seconds of being made and byte-for-byte unchanged. */
  buildSwap(body: BuildRequest): Promise<SwapResponse> {
    return this.request("POST", "/swap", body, 1);
  }

  swapInstructions(body: BuildRequest): Promise<SwapInstructionsResponse> {
    return this.request("POST", "/swap-instructions", body, 1);
  }

  send(signedTransactionBase64: string): Promise<SendResponse> {
    return this.request("POST", "/send-transaction", { transaction: signedTransactionBase64 }, 0);
  }

  status(signature: string): Promise<TransactionStatus> {
    return this.request("GET", `/transaction/${signature}`, undefined, 2);
  }

  private async request<T>(method: "GET" | "POST", path: string, body: unknown, retries: number): Promise<T> {
    const label = `${method} ${path.split("?")[0]}`;
    for (let attempt = 0; ; attempt++) {
      let error: RaptorError;
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: body === undefined ? {} : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await response.text();
        if (response.ok) return JSON.parse(text) as T;
        error = new RaptorError(response.status, errorMessage(response.status, text));
      } catch (cause) {
        error = new RaptorError(undefined, `${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (error.kind !== "transient" || attempt >= retries) throw error;
      const delay = Math.min(4_000, 400 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      console.warn(`${label}: ${error.message}; retry in ${Math.round(delay)} ms`);
      await sleep(delay);
    }
  }
}
