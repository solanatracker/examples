type TradeLike = Record<string, unknown>;

export function normalizeTrade(tx: TradeLike) {
  const sideRaw = tx.type ?? tx.side ?? (tx.isBuy === true ? "buy" : tx.isBuy === false ? "sell" : "?");
  const usdVal = Number(tx.amountUsd ?? tx.volumeUsd ?? tx.volume ?? 0) || null;
  const wallet = String(tx.wallet ?? tx.owner ?? tx.maker ?? tx.user ?? tx.trader ?? "");
  const sig = String(tx.tx ?? tx.signature ?? "");
  return {
    side: String(sideRaw).toLowerCase(),
    usd: usdVal,
    wallet,
    sig,
  };
}

export class TradeTape {
  count = 0;
  buys = 0;
  sells = 0;
  volumeUsd = 0;

  record(tx: TradeLike) {
    const n = normalizeTrade(tx);
    this.count++;
    if (n.side.startsWith("buy")) this.buys++;
    if (n.side.startsWith("sell")) this.sells++;
    if (n.usd) this.volumeUsd += n.usd;
  }

  summary() {
    return { count: this.count, buys: this.buys, sells: this.sells, volumeUsd: this.volumeUsd };
  }
}

export function printTrade(tx: TradeLike) {
  const n = normalizeTrade(tx);
  const time = new Date().toISOString().slice(11, 19);
  console.log(
    time,
    n.side.padEnd(4),
    n.usd != null ? `$${n.usd.toFixed(2)}`.padStart(10) : "".padStart(10),
    n.wallet ? n.wallet.slice(0, 8) + "…" : "",
    n.sig.slice(0, 8)
  );
}

