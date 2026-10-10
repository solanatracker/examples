import bs58 from "bs58";
import type { TxInfo } from "./tx.js";

/**
 * Fetches a confirmed transaction over JSON-RPC and reshapes it into the exact structure a gRPC
 * transaction update carries. Every decoder in this project then runs unchanged on historical data:
 * useful for debugging a decoder against one signature, or backfilling before a stream starts.
 */
export async function fetchTransaction(rpcUrl: string, signature: string): Promise<{ info: TxInfo; slot: string } | undefined> {
  const res = await rpcFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { result: RpcTx | null; error?: { message: string } };
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  if (!body.result) return undefined;
  return { info: toTxInfo(body.result, signature), slot: String(body.result.slot) };
}

/** POST with a short backoff on 429, which public and shared RPC endpoints return under bursty use. */
async function rpcFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 4) return res;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

type RpcInstruction = { programIdIndex: number; accounts: number[]; data: string; stackHeight?: number | null };
type RpcTokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
};
type RpcTx = {
  slot: number;
  transaction: {
    signatures: string[];
    message: {
      header: { numRequiredSignatures: number; numReadonlySignedAccounts: number; numReadonlyUnsignedAccounts: number };
      accountKeys: string[];
      recentBlockhash: string;
      instructions: RpcInstruction[];
      addressTableLookups?: Array<{ accountKey: string; writableIndexes: number[]; readonlyIndexes: number[] }>;
    };
  };
  version?: number | "legacy";
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    innerInstructions?: Array<{ index: number; instructions: RpcInstruction[] }>;
    logMessages?: string[];
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
    loadedAddresses?: { writable: string[]; readonly: string[] };
    computeUnitsConsumed?: number;
  } | null;
};

const key = (s: string) => bs58.decode(s);
const ix = (i: RpcInstruction) => ({
  programIdIndex: i.programIdIndex,
  accounts: Uint8Array.from(i.accounts),
  data: bs58.decode(i.data),
  ...(i.stackHeight ? { stackHeight: i.stackHeight } : {}),
});
const balance = (b: RpcTokenBalance) => ({
  accountIndex: b.accountIndex,
  mint: b.mint,
  owner: b.owner ?? "",
  programId: b.programId ?? "",
  uiTokenAmount: { ...b.uiTokenAmount, uiAmount: b.uiTokenAmount.uiAmount ?? 0 },
});

function toTxInfo(tx: RpcTx, signature: string): TxInfo {
  const m = tx.transaction.message;
  const meta = tx.meta;
  return {
    signature: bs58.decode(signature),
    isVote: false,
    index: "0",
    transaction: {
      signatures: tx.transaction.signatures.map(key),
      message: {
        header: m.header,
        accountKeys: m.accountKeys.map(key),
        recentBlockhash: key(m.recentBlockhash),
        instructions: m.instructions.map(ix),
        versioned: tx.version !== undefined && tx.version !== "legacy",
        addressTableLookups: (m.addressTableLookups ?? []).map((l) => ({
          accountKey: key(l.accountKey),
          writableIndexes: Uint8Array.from(l.writableIndexes),
          readonlyIndexes: Uint8Array.from(l.readonlyIndexes),
        })),
      },
    },
    meta: meta
      ? {
          // gRPC carries the error as bincode bytes; only its presence matters to the decoders.
          err: meta.err ? { err: new TextEncoder().encode(JSON.stringify(meta.err)) } : undefined,
          fee: String(meta.fee),
          preBalances: meta.preBalances.map(String),
          postBalances: meta.postBalances.map(String),
          innerInstructions: (meta.innerInstructions ?? []).map((g) => ({ index: g.index, instructions: g.instructions.map(ix) })),
          innerInstructionsNone: !meta.innerInstructions,
          logMessages: meta.logMessages ?? [],
          logMessagesNone: !meta.logMessages,
          preTokenBalances: (meta.preTokenBalances ?? []).map(balance),
          postTokenBalances: (meta.postTokenBalances ?? []).map(balance),
          rewards: [],
          loadedWritableAddresses: (meta.loadedAddresses?.writable ?? []).map(key),
          loadedReadonlyAddresses: (meta.loadedAddresses?.readonly ?? []).map(key),
          returnData: undefined,
          returnDataNone: true,
          ...(meta.computeUnitsConsumed !== undefined ? { computeUnitsConsumed: String(meta.computeUnitsConsumed) } : {}),
        }
      : undefined,
  };
}
