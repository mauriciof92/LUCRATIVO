import type { BetResult } from './backtest';

export function validateBetResult(raw: any): BetResult | null {
  // 1. Validar match
  if (!raw.match || typeof raw.match !== 'string') {
    return null;
  }

  // 2. Validar hour
  if (!raw.hour || typeof raw.hour !== 'string') {
    return null;
  }

  // 3. Validar mainMarket
  if (!raw.mainMarket?.label || !raw.mainMarket?.odd) {
    console.warn('[CANONICAL] mainMarket inválido:', raw.match);
    return null;
  }

  // 4. Retornar objeto com tipos garantidos
  return {
    id: raw.id ?? '',
    match: raw.match,
    league: raw.league ?? '',
    hour: raw.hour,
    status: raw.status ?? 'NS',
    resultHome: Number(raw.resultHome ?? 0),
    resultAway: Number(raw.resultAway ?? 0),
    profile: raw.profile ?? '',
    score: Number(raw.score ?? 0),
    confidence: Number(raw.confidence ?? 0),
    favorito: raw.favorito ?? null,
    poison: raw.poison ?? undefined,
    mainMarket: {
      label: raw.mainMarket.label,
      odd: Number(raw.mainMarket.odd ?? 0),
      minOdd: Number(raw.mainMarket.minOdd ?? 0),
      stake: Number(raw.mainMarket.stake ?? 25),
      result: raw.mainMarket.result ?? 'no-odd',
      profit: Number(raw.mainMarket.profit ?? 0),
      hasValue: Boolean(raw.mainMarket.hasValue ?? false),
      isManual: Boolean(raw.mainMarket.isManual ?? false),
    },
    combo: Array.isArray(raw.combo) ? raw.combo : [],
    ftGoals: Number(raw.ftGoals ?? 0),
    importDate: raw.importDate ?? '',
  };
}
