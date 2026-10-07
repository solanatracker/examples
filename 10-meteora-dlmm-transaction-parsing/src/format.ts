const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** USD with sensible precision for sub-cent memecoin prices. */
export function usd(n: number | null | undefined): string {
  if (!isNum(n)) return "n/a";
  if (n !== 0 && Math.abs(n) < 0.01) return `$${n.toPrecision(3)}`;
  return usdFormat.format(n);
}

export function compactUsd(n: number | null | undefined): string {
  return isNum(n) ? `$${compactFormat.format(n)}` : "n/a";
}

export function compact(n: number | null | undefined): string {
  return isNum(n) ? compactFormat.format(n) : "n/a";
}

export function pct(n: number | null | undefined, digits = 1): string {
  return isNum(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%` : "n/a";
}

export function short(address: string | null | undefined, chars = 4): string {
  if (!address) return "?";
  return address.length <= chars * 2 + 1 ? address : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function time(ms: number | null | undefined = Date.now()): string {
  return isNum(ms) ? new Date(ms).toISOString().slice(11, 19) : "--:--:--";
}

/** Prints rows as aligned columns. */
export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => (c ?? "").padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
}
