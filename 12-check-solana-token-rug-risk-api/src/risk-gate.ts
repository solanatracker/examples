import type { TokenDetailResponse, TokenRiskFactor } from "@solana-tracker/data-api";

type TokenRisk = TokenDetailResponse["risk"];

/** Your screening policy. These are product settings, not trading advice. */
export type GatePolicy = {
  /** Fail when risk.score is above this value (scale 1-10, higher = riskier). */
  maxScore: number;
  /** Fail when snipers hold more than this percent of supply. */
  maxSniperPct: number;
  /** Fail when insiders hold more than this percent of supply. */
  maxInsiderPct: number;
  /** Fail on any factor whose level is "danger". */
  blockDangerFactors: boolean;
};

/** Three states on purpose: missing data is never treated as a pass. */
export type GateVerdict = {
  status: "PASS" | "FAIL" | "UNKNOWN";
  reasons: string[];
};

export type RiskFactor = {
  name: string;
  level: string;
  description: string;
  value?: string;
};

/**
 * The guides document `risk.risks` as objects ({ name, description, level, score, value? }),
 * while the OpenAPI schema lists plain strings. Accept both so a schema change cannot crash the gate.
 */
export function normalizeFactors(risks: unknown): RiskFactor[] {
  if (!Array.isArray(risks)) return [];
  return risks.map((entry: unknown): RiskFactor => {
    if (typeof entry === "string") return { name: entry, level: "unknown", description: "" };
    const factor = (entry ?? {}) as Partial<TokenRiskFactor>;
    return {
      name: typeof factor.name === "string" ? factor.name : "unnamed factor",
      level: typeof factor.level === "string" ? factor.level : "unknown",
      description: typeof factor.description === "string" ? factor.description : "",
      value: factor.value === undefined ? undefined : String(factor.value),
    };
  });
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function evaluateRisk(risk: TokenRisk | null | undefined, policy: GatePolicy): GateVerdict {
  if (!risk || !isNum(risk.score)) {
    return { status: "UNKNOWN", reasons: ["no risk score in the response"] };
  }

  const reasons: string[] = [];
  if (risk.rugged) reasons.push("rugged flag is set");
  if (risk.score > policy.maxScore) reasons.push(`score ${risk.score} > ${policy.maxScore}`);

  const snipers = risk.snipers?.totalPercentage;
  if (isNum(snipers) && snipers > policy.maxSniperPct) {
    reasons.push(`snipers hold ${snipers.toFixed(1)}% > ${policy.maxSniperPct}%`);
  }

  const insiders = risk.insiders?.totalPercentage;
  if (isNum(insiders) && insiders > policy.maxInsiderPct) {
    reasons.push(`insiders hold ${insiders.toFixed(1)}% > ${policy.maxInsiderPct}%`);
  }

  if (policy.blockDangerFactors) {
    for (const factor of normalizeFactors(risk.risks)) {
      if (factor.level === "danger") reasons.push(`danger: ${factor.name}`);
    }
  }

  return { status: reasons.length > 0 ? "FAIL" : "PASS", reasons };
}
