type RpcResponse<T> = { result?: T; error?: { code: number; message: string } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal JSON-RPC call: per-request timeout, up to three retries with backoff on 429 and 5xx. */
export async function rpc<T>(url: string, method: string, params: unknown[], timeoutMs = 10_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = (await res.json()) as RpcResponse<T>;
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }
}
