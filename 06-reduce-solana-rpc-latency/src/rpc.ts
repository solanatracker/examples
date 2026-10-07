/**
 * Minimal JSON-RPC over fetch. No Solana SDK needed for timing plain calls.
 * Node's fetch keeps connections alive by default, so after the first request
 * to a host the TCP and TLS handshakes are reused.
 */

export type FailureKind = "timeout" | "http" | "rate-limit" | "rpc" | "network";

export class RpcFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

let nextId = 1;

export type Timed<T> = { ms: number; result: T };

/** Sends one JSON-RPC request and measures the full round trip, including body parsing. */
export async function timedRpc<T>(url: string, method: string, params: unknown[], timeoutMs: number): Promise<Timed<T>> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new RpcFailure("timeout", `timed out after ${timeoutMs} ms`);
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
    throw new RpcFailure("network", cause);
  }

  if (response.status === 429) throw new RpcFailure("rate-limit", "HTTP 429 Too Many Requests");
  if (response.status === 401 || response.status === 403) {
    throw new RpcFailure("http", `HTTP ${response.status} (check the API key in the URL)`);
  }
  if (!response.ok) throw new RpcFailure("http", `HTTP ${response.status}`);

  let body: JsonRpcResponse<T>;
  try {
    body = (await response.json()) as JsonRpcResponse<T>;
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw timedOut ? new RpcFailure("timeout", `timed out after ${timeoutMs} ms`) : new RpcFailure("http", "response was not JSON");
  }
  const ms = performance.now() - started;

  // JSON-RPC errors arrive with HTTP 200, so check the body as well as the status.
  if (body.error) throw new RpcFailure("rpc", `RPC ${body.error.code}: ${body.error.message}`);
  if (body.result === undefined) throw new RpcFailure("rpc", "response has no result");
  return { ms, result: body.result };
}

const SECRET_PARAMS = new Set(["api_key", "api-key", "apikey", "key", "token", "x-token"]);

/**
 * Returns a printable label for an endpoint URL.
 * Masks key-like query parameters and long path segments (some providers put the key in the path).
 */
export function redactUrl(raw: string): string {
  const url = new URL(raw);
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_PARAMS.has(name.toLowerCase())) url.searchParams.set(name, "***");
  }
  url.pathname = url.pathname
    .split("/")
    .map((segment) => (segment.length >= 20 ? "***" : segment))
    .join("/");
  return url.toString().replace(/%2A/g, "*").replace(/\/$/, "");
}
