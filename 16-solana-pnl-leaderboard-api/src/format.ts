export function usd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  return `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
}

export function short(addr: string, n = 8): string {
  return !addr || addr.length <= n ? addr || "?" : `${addr.slice(0, n)}…`;
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s : s.padEnd(n);
}

