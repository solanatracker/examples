import idl from "../../idl/meteora-dlmm.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode, mintOf } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);

export const meteoraDlmm: Protocol = {
  id: "meteora-dlmm",
  label: "Meteora DLMM",
  programId: coder.programId,
  coder,

  // Newer swap instructions emit both the legacy `Swap` event and `Swap2Evt`. Keep one per
  // instruction, preferring the newer shape.
  trades(tx) {
    const d = decode(tx, coder);
    const byPath = new Map<string, (typeof d.events)[number]>();
    for (const e of d.eventsNamed("Swap", "Swap2Evt")) {
      if (!byPath.has(e.path) || e.name === "Swap2Evt") byPath.set(e.path, e);
    }
    const out: Trade[] = [];
    for (const e of byPath.values()) {
      const ix = d.ixAt(e.path);
      const forY = e.data.swapForY === true;
      const x = ix?.accounts.tokenXMint ?? "";
      const y = ix?.accounts.tokenYMint ?? "";
      out.push({
        ...base(tx, "meteora-dlmm"),
        label: ix?.name ?? "swap",
        path: e.path,
        trader: str(e.data.from),
        pool: str(e.data.lbPair),
        inputMint: (forY ? x : y) || (mintOf(tx, ix?.accounts.userTokenIn) ?? ""),
        inputAmount: big(e.data.amountIn),
        outputMint: (forY ? y : x) || (mintOf(tx, ix?.accounts.userTokenOut) ?? ""),
        outputAmount: big(e.data.amountOut),
      });
    }
    return out;
  },

  pools(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("LbPairCreate").map((e) => ({
      ...base(tx, "meteora-dlmm"),
      pool: str(e.data.lbPair),
      mintA: str(e.data.tokenX),
      mintB: str(e.data.tokenY),
      creator: d.ixAt(e.path)?.accounts.funder ?? tx.signer,
    }));
  },
};
