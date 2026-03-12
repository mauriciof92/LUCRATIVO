// src/lib/trigger-adapter.ts
import { MatchInput } from './trigger-engine';

/**
 * Mapa CSV → MatchInput
 * Colunas: engine.js parseCSV (47 colunas, sep ';' ou ',')
 * Col 9  = oddOver25FT   (Odds Mais de 2.5 gols FT)
 * Col 12 = oddBTTSYes    (Odds Ambas marcarem Sim)
 * Col 13 = oddOver05HT   (Odds Mais de 0.5 gols 1T)
 * Col 25 = exGTotal      (xG)
 * Col 32 = af            (Força de ataque H|A)
 * Col 34 = gol05HT       (% Over 0.5 gols HT H|A)
 * Col 37 = btsPercent    (% Ambas marcam)
 * Col 44 = favoritismo
 */

function parsePipe(val: string | undefined, side: 'h' | 'a'): number | null {
  if (!val) return null;
  const parts = String(val).split('|');
  const n = parseFloat(side === 'h' ? parts[0] : parts[1]);
  return isNaN(n) ? null : n;
}

function parseNum(val: any): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function calcFieldCoverage(game: any): number {
  const fields = [
    game.exGTotal,
    game.afH,
    game.afA,
    game.gol05HTH,
    game.gol05HTA,
    game.chHTFav,
    game.cantHT,
    game.league,
    game.hour,
  ];
  const filled = fields.filter((f) => f != null && f !== '' && f !== 0).length;
  return filled / fields.length;
}

export function gameToMatchInput(game: any): MatchInput {
  // af vem como "65|48" → afHome=65, afAway=48
  const afH = parsePipe(game.af, 'h') ?? game.afH ?? null;
  const afA = parsePipe(game.af, 'a') ?? game.afA ?? null;

  // gol05HT vem como "72|58"
  const gol05HTH = parsePipe(game.gol05HT, 'h') ?? game.gol05HTH ?? null;
  const gol05HTA = parsePipe(game.gol05HT, 'a') ?? game.gol05HTA ?? null;

  const exGTotal = parseNum(game.exGTotal ?? game.exG) ?? null;

  // Deriva lambda home/away via af se não tiver direto
  const lambdaHomeFT =
    exGTotal != null && afH != null && afA != null
      ? exGTotal * (afH / Math.max(1, afH + afA))
      : null;

  const lambdaAwayFT =
    exGTotal != null && afH != null && afA != null
      ? exGTotal * (afA / Math.max(1, afH + afA))
      : null;

  // Odds reais injetadas via API (game.odds vem do ODDS-INJECT)
  const hasRealOdds = !!game.hasRealOdds;

  // Odds: prioridade API real → fallback CSV raw
  // Engine.js expõe odds em game.odds com mapeamento:
  // - col[9] → "Odds Mais de 2.5 gols FT"
  // - col[12] → "Odds Ambas marcarem (Sim)" 
  // - col[13] → "Odds Mais de 0.5 gols 1T"

  const oddOver05HT =
    parseNum(game.odds?.["Odds Mais de 0.5 gols 1T"]) ??  // API real ou CSV col13
    undefined;

  const oddOver25FT =
    parseNum(game.odds?.["Odds Mais de 2.5 gols FT"]) ??  // API real ou CSV col9
    undefined;

  const oddBTTSYes =
    parseNum(game.odds?.["Odds Ambas marcarem (Sim)"]) ??  // API real ou CSV col12
    undefined;

  // dataMode: csv_plus_api só se odds REAIS injetadas (não CSV)
  const hasRealApiOdds = !!game.hasRealOdds;
  const hasAnyCsvOdds = !!(oddOver05HT || oddOver25FT || oddBTTSYes);

  // Chutes HT para lambda HT (se disponível)
  const chHTFav = game.chHTFav ? Number(game.chHTFav) : null;

  return {
    dataMode: hasRealOdds ? 'csv_plus_api' : 'csv_only',
    league: game.league ?? undefined,

    // Odds
    oddOver05HT,
    oddOver25FT,
    oddBTTSYes,

    // Lambdas
    exGTotal: exGTotal ?? undefined,
    exGHome: lambdaHomeFT ?? undefined,
    exGAway: lambdaAwayFT ?? undefined,
    lambdaHomeFT: lambdaHomeFT ?? undefined,
    lambdaAwayFT: lambdaAwayFT ?? undefined,
    lambdaHT: chHTFav ? chHTFav * 0.44 : undefined,

    // Auxiliares
    afHome: afH ?? undefined,
    afAway: afA ?? undefined,
    pctGoal05HTHome: gol05HTH ? gol05HTH / 100 : undefined,
    pctGoal05HTAway: gol05HTA ? gol05HTA / 100 : undefined,
    pctBTTSHome: parseNum(game.btsPercent) ? parseNum(game.btsPercent)! / 100 : undefined,

    // Qualidade
    fieldCoverage: calcFieldCoverage({ ...game, afH, afA, gol05HTH, gol05HTA }),
    sourceFreshnessHours: 12, // CSV diário
  };
}
