import idl from "../../idl/moonshot.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { WSOL } from "../lib/tx.js";
import { base, coderFor, decode } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);
type MintParams = { name?: string; symbol?: string; uri?: string };

export const moonshot: Protocol = {
  id: "moonshot",
  label: "Moonshot",
  programId: coder.programId,
  coder,

  // Curves are quoted in SOL: `amount` is the token side, `collateralAmount` the lamports.
  trades(tx) {
    const d = decode(tx, coder);
    const out: Trade[] = [];
    for (const e of d.eventsNamed("TradeEvent")) {
      const mint = d.ixAt(e.path)?.accounts.mint;
      if (!mint) continue;
      const buy = e.data.type === "buy";
      const tokens = big(e.data.amount);
      const sol = big(e.data.collateralAmount);
      out.push({
        ...base(tx, "moonshot"),
        label: buy ? "buy" : "sell",
        path: e.path,
        trader: str(e.data.sender),
        pool: str(e.data.curve),
        inputMint: buy ? WSOL : mint,
        inputAmount: buy ? sol : tokens,
        outputMint: buy ? mint : WSOL,
        outputAmount: buy ? tokens : sol,
      });
    }
    return out;
  },

  launches(tx) {
    return decode(tx, coder)
      .ixsNamed("tokenMint")
      .map((ix) => {
        const params = (ix.args.mintParams ?? {}) as MintParams;
        return {
          ...base(tx, "moonshot"),
          mint: ix.accounts.mint ?? "",
          curve: ix.accounts.curveAccount ?? "",
          creator: ix.accounts.sender ?? tx.signer,
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
        };
      });
  },

  migrations(tx) {
    return decode(tx, coder)
      .ixsNamed("migrateFunds")
      .map((ix) => ({ ...base(tx, "moonshot"), mint: ix.accounts.mint ?? "", curve: ix.accounts.curveAccount ?? "" }));
  },
};
