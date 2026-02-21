/**
 * MÓDULO DE GESTÃO DE BANCA
 * Kelly Criterion + Logs de Evolução
 *
 * Kelly Formula: f* = (b×p - q) / b
 *   onde:
 *   f* = fração da banca a apostar
 *   b  = odd - 1 (lucro por unidade apostada)
 *   p  = probabilidade estimada de win
 *   q  = 1 - p (probabilidade de lose)
 *
 * Usamos 25% do Kelly ("Quarter Kelly") para gestão conservadora.
 */

export interface KellyInput {
  odd: number;                    // Odd oferecida pela casa
  estimatedProbability: number;   // Nossa estimativa (0-1)
  currentBankroll: number;        // Banca atual em unidades
  maxStakePercent?: number;       // Teto de % da banca (default: 5%)
  kellyFraction?: number;         // Fração do Kelly (default: 0.25)
}

export interface KellyResult {
  optimalStake: number;           // Stake sugerido em unidades
  stakePercent: number;           // % da banca
  expectedValue: number;          // EV em % (positivo = valor)
  isValueBet: boolean;            // EV > 0?
  riskLevel: "baixo" | "medio" | "alto";
  reasoning: string;              // Explicação em português
  worstCase: number;              // Perda se lose (-stake)
  bestCase: number;               // Ganho se win (stake × (odd-1))
  breakEvenOdd: number;           // Odd mínima para EV = 0
}

export function calculateOptimalStake(input: KellyInput): KellyResult {
  const {
    odd,
    estimatedProbability: p,
    currentBankroll,
    maxStakePercent = 0.05,
    kellyFraction = 0.25,
  } = input;

  const q = 1 - p;
  const b = odd - 1;

  const expectedValue = (p * odd) - 1;
  const isValueBet = expectedValue > 0.02;

  const kellyFull = (b * p - q) / b;

  if (kellyFull <= 0) {
    return {
      optimalStake: 0,
      stakePercent: 0,
      expectedValue: Math.round(expectedValue * 1000) / 10,
      isValueBet: false,
      riskLevel: "baixo",
      reasoning: `❌ Sem valor. Nossa probabilidade (${(p * 100).toFixed(0)}%) está abaixo do implícito da odd (${(1 / odd * 100).toFixed(0)}%).`,
      worstCase: 0,
      bestCase: 0,
      breakEvenOdd: Math.round((1 / p) * 100) / 100,
    };
  }

  const kellyAdjusted = kellyFull * kellyFraction;
  const stakePercent = Math.min(kellyAdjusted, maxStakePercent);
  const optimalStake = Math.round(currentBankroll * stakePercent * 10) / 10;

  const riskLevel: KellyResult["riskLevel"] =
    stakePercent <= 0.02 ? "baixo" :
    stakePercent <= 0.04 ? "medio" : "alto";

  const impliedProb = (1 / odd * 100).toFixed(0);
  const ourProb = (p * 100).toFixed(0);
  const edge = ((p - 1 / odd) * 100).toFixed(1);

  const reasoning =
    `Nossa probabilidade: ${ourProb}% vs implícito da odd: ${impliedProb}%. ` +
    `Edge: +${edge}%. Kelly pleno: ${(kellyFull * 100).toFixed(1)}% → ` +
    `Quarter Kelly: ${(stakePercent * 100).toFixed(1)}% da banca = ${optimalStake}u.`;

  return {
    optimalStake,
    stakePercent: Math.round(stakePercent * 1000) / 10,
    expectedValue: Math.round(expectedValue * 1000) / 10,
    isValueBet,
    riskLevel,
    reasoning,
    worstCase: -optimalStake,
    bestCase: Math.round(optimalStake * b * 10) / 10,
    breakEvenOdd: Math.round((1 / p) * 100) / 100,
  };
}

/**
 * Calcula stake fixo de R$ 25,00 com análise de valor
 * Para uso rápido quando não há banca configurada
 */
export function quickStakeAnalysis(odd: number, estimatedProbability: number): {
  stake: number;
  ev: number;
  isValue: boolean;
  label: string;
} {
  const ev = (estimatedProbability * odd) - 1;
  const isValue = ev > 0.02;
  return {
    stake: 25.00,
    ev: Math.round(ev * 1000) / 10,
    isValue,
    label: isValue
      ? `✅ EV +${(ev * 100).toFixed(1)}% — Apostar R$ 25,00`
      : `⚠️ EV ${(ev * 100).toFixed(1)}% — Sem valor`,
  };
}
