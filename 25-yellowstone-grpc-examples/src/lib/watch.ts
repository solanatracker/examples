import type { SubscribeRequestFilterTransactions } from "@triton-one/yellowstone-grpc";
import { optionalEnv } from "./env.js";
import { CommitmentLevel, emptyRequest, runStream } from "./grpc.js";
import { parseTx, type ParsedTx } from "./parsed.js";
import { onShutdown } from "./shutdown.js";

/**
 * Commitment for every recipe, from GRPC_COMMITMENT (processed | confirmed | finalized).
 * Processed is fastest; a processed transaction can still land on a fork that gets dropped.
 */
export function commitment(): CommitmentLevel {
  const value = (optionalEnv("GRPC_COMMITMENT") ?? "processed").toLowerCase();
  if (value === "confirmed") return CommitmentLevel.CONFIRMED;
  if (value === "finalized") return CommitmentLevel.FINALIZED;
  return CommitmentLevel.PROCESSED;
}

export type TxFilter = Partial<SubscribeRequestFilterTransactions>;

/** A named transaction filter with the defaults recipes want: no votes, no failed transactions. */
export function txFilter(filter: TxFilter): SubscribeRequestFilterTransactions {
  return { vote: false, failed: false, accountInclude: [], accountExclude: [], accountRequired: [], ...filter };
}

/**
 * Streams transactions matching `filter`, parses each one once, and hands it to `onTx`.
 * Stops cleanly on Ctrl+C.
 */
export function watchTransactions(filter: TxFilter, onTx: (tx: ParsedTx) => void) {
  const request = { ...emptyRequest(), commitment: commitment(), transactions: { txs: txFilter(filter) } };
  const stream = runStream({
    request,
    onUpdate: (update) => {
      const t = update.transaction;
      if (t?.transaction) onTx(parseTx(t.transaction, t.slot));
    },
  });
  onShutdown(async () => {
    stream.stop();
    await stream.done;
  });
  return stream;
}
