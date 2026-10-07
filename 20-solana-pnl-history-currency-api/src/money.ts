/** Formats monetary PnL fields in the denomination the API returned (field names stay USD-named). */
export type Currency = "usd" | "sol" | "eur";

const fiat: Record<"usd" | "eur", Intl.NumberFormat> = {
  usd: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
  eur: new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }),
};

export function money(n: number | null | undefined, currency: Currency, signed = false): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  const sign = signed && n > 0 ? "+" : "";
  if (currency === "sol") return `${sign}${n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 })} SOL`;
  return `${sign}${fiat[currency].format(n)}`;
}

export function percent(n: number | null | undefined, digits = 1): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(digits)}%` : "n/a";
}
