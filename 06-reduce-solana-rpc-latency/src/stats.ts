/** Nearest-rank percentile on an ascending copy of the samples. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? Number.NaN;
}

export type Summary = { n: number; p50: number; p90: number; p99: number; min: number; max: number };

export function summarize(samples: number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? Number.NaN,
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

export function ms(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(1)} ms` : "n/a";
}
