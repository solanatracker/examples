/** Minimal gate — tune thresholds for your strategy. */
export type RiskPayload = {
  score?: number;
  rugged?: boolean;
  snipers?: { totalPercentage?: number; count?: number };
  insiders?: { totalPercentage?: number; count?: number };
  bundlers?: { totalPercentage?: number; count?: number };
  dev?: { percentage?: number };
  risks?: Array<{ name?: string; description?: string }>;
};

export function passRiskGate(risk: RiskPayload | undefined, opts: { minScore?: number; maxSnipers?: number } = {}) {
  const minScore = opts.minScore ?? 6;
  const maxSnipers = opts.maxSnipers ?? 20;
  if (!risk || risk.rugged) return { ok: false, reason: "rugged or missing risk data" };
  if ((risk.score ?? 0) < minScore) return { ok: false, reason: `score ${risk.score} < ${minScore}` };
  if ((risk.snipers?.totalPercentage ?? 0) > maxSnipers) {
    return { ok: false, reason: `snipers ${risk.snipers?.totalPercentage?.toFixed(1)}% > ${maxSnipers}%` };
  }
  return { ok: true, reason: "passed" };
}

