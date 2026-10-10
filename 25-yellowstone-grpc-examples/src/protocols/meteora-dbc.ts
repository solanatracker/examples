import idl from "../../idl/meteora-dbc.json" with { type: "json" };
import { big, num, str } from "../lib/parsed.js";
import { base, coderFor, decode } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);
type SwapResult = { includedFeeInputAmount?: bigint; actualInputAmount?: bigint; outputAmount?: bigint };
type PoolParams = { name?: string; symbol?: string; uri?: string };

/** Direction 1 is quote → base: the trader buys the launched token. */
const QUOTE_TO_BASE = 1;

export const meteoraDbc: Protocol = {
  id: "meteora-dbc",
  label: "Meteora Dynamic Bonding Curve",
  programId: coder.programId,
  coder,

  // swap2 emits EvtSwap and EvtSwap2 from the same instruction. EvtSwap2 is preferred because it
  // reports the fee-inclusive input amount.
  trades(tx) {
    const d = decode(tx, coder);
    const byPath = new Map<string, (typeof d.events)[number]>();
    for (const e of d.eventsNamed("EvtSwap", "EvtSwap2")) {
      if (!byPath.has(e.path) || e.name === "EvtSwap2") byPath.set(e.path, e);
    }
    const out: Trade[] = [];
    for (const e of byPath.values()) {
      const ix = d.ixAt(e.path);
      const buy = num(e.data.tradeDirection) === QUOTE_TO_BASE;
      const result = (e.data.swapResult ?? {}) as SwapResult;
      const baseMint = ix?.accounts.baseMint ?? "";
      const quoteMint = ix?.accounts.quoteMint ?? "";
      out.push({
        ...base(tx, "meteora-dbc"),
        label: ix?.name ?? (buy ? "buy" : "sell"),
        path: e.path,
        trader: ix?.accounts.payer ?? tx.signer,
        pool: str(e.data.pool),
        inputMint: buy ? quoteMint : baseMint,
        inputAmount: big(result.includedFeeInputAmount ?? result.actualInputAmount),
        outputMint: buy ? baseMint : quoteMint,
        outputAmount: big(result.outputAmount),
      });
    }
    return out;
  },

  launches(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("EvtInitializePool").map((e) => {
      const params = (d.ixAt(e.path)?.args.params ?? {}) as PoolParams;
      return {
        ...base(tx, "meteora-dbc"),
        mint: str(e.data.baseMint),
        curve: str(e.data.pool),
        creator: str(e.data.creator),
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
      };
    });
  },

  migrations(tx) {
    return decode(tx, coder)
      .ixsNamed("migrationDammV2", "migrateMeteoraDamm")
      .map((ix) => ({
        ...base(tx, "meteora-dbc"),
        mint: ix.accounts.baseMint ?? ix.accounts.tokenAMint ?? "",
        curve: ix.accounts.virtualPool ?? "",
        pool: ix.accounts.pool,
      }));
  },
};
