import { fail, numberEnv, optionalEnv, requireEnv } from "./env.js";
import { table } from "./format.js";
import { RpcFailure, redactUrl, timedRpc, type FailureKind } from "./rpc.js";
import { ms, summarize } from "./stats.js";

type Commitment = "processed" | "confirmed" | "finalized";
const COMMITMENTS: Commitment[] = ["processed", "confirmed", "finalized"];

type LatestBlockhash = { context: { slot: number }; value: { blockhash: string; lastValidBlockHeight: number } };

type Endpoint = {
  label: string;
  url: string;
  coldMs: number | null;
  slotMs: number[];
  blockhashMs: number[];
  lags: number[];
  errors: Map<FailureKind, number>;
  lastError?: string;
};

// ---- configuration -------------------------------------------------------

function readEndpoints(): Endpoint[] {
  const raw =
    optionalEnv("RPC_URLS") ??
    requireEnv("SOLANA_RPC_URL", "copy the endpoint from https://www.solanatracker.io/account/shared-rpc, or set RPC_URLS");
  const urls = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (urls.length === 0) fail("RPC_URLS is set but contains no URLs");

  return urls.map((url, i) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // Never echo the raw value: it may contain an API key.
      return fail(`Endpoint #${i + 1} is not a valid URL`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") fail(`Endpoint #${i + 1} must use http(s)`);
    return { label: redactUrl(url), url, coldMs: null, slotMs: [], blockhashMs: [], lags: [], errors: new Map() };
  });
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = numberEnv(name, fallback);
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

function readCommitment(): Commitment {
  const value = (optionalEnv("COMMITMENT") ?? "confirmed") as Commitment;
  if (!COMMITMENTS.includes(value)) fail(`COMMITMENT must be one of: ${COMMITMENTS.join(", ")}`);
  return value;
}

const endpoints = readEndpoints();
const SAMPLES = intEnv("SAMPLES", 20, 1, 1000);
const TIMEOUT_MS = intEnv("TIMEOUT_MS", 5000, 100, 60_000);
// Default pacing keeps a single endpoint under 5 requests per second (2 calls per round).
const INTERVAL_MS = intEnv("INTERVAL_MS", 400, 0, 10_000);
const COMMITMENT = readCommitment();

// ---- measurement ---------------------------------------------------------

let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
  console.log("\nStopping after the current round (Ctrl+C again to exit now)...");
  process.once("SIGINT", () => process.exit(130));
});

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

function recordError(endpoint: Endpoint, error: unknown): void {
  const kind: FailureKind = error instanceof RpcFailure ? error.kind : "network";
  endpoint.errors.set(kind, (endpoint.errors.get(kind) ?? 0) + 1);
  endpoint.lastError = error instanceof Error ? error.message : String(error);
}

/** First request per endpoint: includes DNS, TCP and TLS setup. Reported separately, never mixed into the stats. */
async function warmUp(): Promise<void> {
  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const { ms: elapsed } = await timedRpc<number>(endpoint.url, "getSlot", [{ commitment: COMMITMENT }], TIMEOUT_MS);
        endpoint.coldMs = elapsed;
      } catch (error) {
        recordError(endpoint, error);
        console.warn(`warm-up failed for ${endpoint.label}: ${endpoint.lastError}`);
      }
    }),
  );
}

async function round(): Promise<void> {
  // getSlot on every endpoint at the same moment, so slot values are comparable.
  const slots = await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const { ms: elapsed, result } = await timedRpc<number>(endpoint.url, "getSlot", [{ commitment: COMMITMENT }], TIMEOUT_MS);
        endpoint.slotMs.push(elapsed);
        return result;
      } catch (error) {
        recordError(endpoint, error);
        return null;
      }
    }),
  );

  const highest = Math.max(...slots.filter((s): s is number => s !== null));
  if (Number.isFinite(highest)) {
    slots.forEach((slot, i) => {
      if (slot !== null) endpoints[i]?.lags.push(highest - slot);
    });
  }

  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const { ms: elapsed } = await timedRpc<LatestBlockhash>(
          endpoint.url,
          "getLatestBlockhash",
          [{ commitment: COMMITMENT }],
          TIMEOUT_MS,
        );
        endpoint.blockhashMs.push(elapsed);
      } catch (error) {
        recordError(endpoint, error);
      }
    }),
  );
}

// ---- report --------------------------------------------------------------

function latencyTable(title: string, pick: (e: Endpoint) => number[]): void {
  console.log(`\n${title}`);
  table(
    ["Endpoint", "ok", "p50", "p90", "p99", "min", "max"],
    endpoints.map((e) => {
      const s = summarize(pick(e));
      return [e.label, String(s.n), ms(s.p50), ms(s.p90), ms(s.p99), ms(s.min), ms(s.max)];
    }),
  );
}

function report(rounds: number): void {
  console.log(`\nCompleted ${rounds} round(s) per endpoint (2 calls per round, commitment ${COMMITMENT}).`);
  latencyTable("getSlot round trip", (e) => e.slotMs);
  latencyTable("getLatestBlockhash round trip", (e) => e.blockhashMs);

  console.log("\nCold start and slot lag (vs highest slot seen in the same round)");
  table(
    ["Endpoint", "cold", "lag p50 (slots)", "lag max (slots)", "rounds behind"],
    endpoints.map((e) => {
      const lag = summarize(e.lags);
      const behind = e.lags.filter((l) => l > 0).length;
      return [
        e.label,
        e.coldMs === null ? "failed" : ms(e.coldMs),
        Number.isFinite(lag.p50) ? String(lag.p50) : "n/a",
        Number.isFinite(lag.max) ? String(lag.max) : "n/a",
        `${behind}/${e.lags.length}`,
      ];
    }),
  );
  if (endpoints.length === 1) console.log("Slot lag needs two or more endpoints in RPC_URLS.");

  const failing = endpoints.filter((e) => e.errors.size > 0);
  if (failing.length > 0) {
    console.log("\nErrors (counted, excluded from latency)");
    table(
      ["Endpoint", "errors", "last error"],
      failing.map((e) => [
        e.label,
        [...e.errors].map(([kind, count]) => `${kind}=${count}`).join(" "),
        e.lastError ?? "",
      ]),
    );
  }
}

async function main(): Promise<void> {
  console.log(
    `Benchmarking ${endpoints.length} endpoint(s): ${SAMPLES} samples, timeout ${TIMEOUT_MS} ms, interval ${INTERVAL_MS} ms, commitment ${COMMITMENT}`,
  );
  for (const e of endpoints) console.log(`  ${e.label}`);

  await warmUp();

  let completed = 0;
  for (let i = 1; i <= SAMPLES && !stopping; i++) {
    await round();
    completed = i;
    if (i % 5 === 0 || i === SAMPLES) console.log(`  round ${i}/${SAMPLES}`);
    if (i < SAMPLES && !stopping) await sleep(INTERVAL_MS);
  }

  report(completed);

  const anySuccess = endpoints.some((e) => e.slotMs.length + e.blockhashMs.length > 0);
  if (!anySuccess) fail("Every request failed. Check the endpoint URLs, API keys and the errors above.");
}

main().catch((error: unknown) => fail(`Error: ${error instanceof Error ? error.message : String(error)}`));
