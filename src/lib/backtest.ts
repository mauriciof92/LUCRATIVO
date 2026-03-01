import { parseCSV, getOddForLabel, getMinOddForLabel, classifyProfile, suggestMainMarket, suggestCombo, getFavorito, computeConfidence, computeScore, getScore, calculateRiskAdjustedStake, shouldSkipBet, calculateValueBet, detectPoisonTriggers } from "../engine";
import type { RealStats } from "./footballApi";

export interface BetResult {
  id: string;
  match: string;
  league: string;
  hour: string;
  status: string;
  resultHome: number;
  resultAway: number;
  ftGoals: number;
  // 🆕 Campo do Supabase para timestamp
  created_at?: string;
  // 🆕 ID real da fixture na API-Football (preenchido pelo fixture-matcher)
  fixtureId?: number;
  // 🆕 Data de importação ISO (ex: "2026-02-25")
  importDate?: string;
  // 🆕 Campos reais da API para validação
  actualTotalShotsHT?: number;
  actualTotalCornersHT?: number;
  // 🆕 Campos para entrada manual
  manualInput?: {
    shotsHT?: number;
    cornersHT?: number;
  };
  mainMarket: {
    label: string;
    odd: number | null;
    minOdd: number | null;
    stake: number;
    result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual";
    profit: number;
    hasValue: boolean;
    isManual?: boolean; // 🆕 Flag para dados auditados manualmente
  };
  combo: Array<{
    label: string;
    odd: number | null;
    minOdd: number | null;
    stake: number;
    result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual";
    profit: number;
    hasValue: boolean;
    isManual?: boolean; // 🆕 Flag para dados auditados manualmente
  }>;
  score: number;
  profile: string;
  confidence: number;
  favorito: ReturnType<typeof getFavorito>;
  poison?: {
    isPoison: boolean;
    triggers: Array<{ level: number; icon: string; tag: string; color: string; glow: string; reason: string }>;
    highestLevel: number;
    primaryTrigger: { level: number; icon: string; tag: string; color: string; glow: string; reason: string } | null;
  };
}

export interface BacktestSummary {
  totalBets: number;
  totalStake: number;
  totalProfit: number;
  roi: number;
  yield: number;
  hitRate: number;
  maxDrawdown: number;
  byProfile: Record<string, { bets: number; stake: number; profit: number; roi: number; hitRate: number }>;
  byMarket: Record<string, { bets: number; stake: number; profit: number; roi: number; hitRate: number }>;
  withValue: { bets: number; stake: number; profit: number; roi: number; hitRate: number };
  withoutValue: { bets: number; stake: number; profit: number; roi: number; hitRate: number };
}

export function resolveMarketResult(label: string, game: any): "win" | "lose" | "push" | "no-odd" | "avg" {
  const home = game.resultHome ?? 0;
  const away = game.resultAway ?? 0;
  const ft = home + away;
  const nl = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

  // Goals markets — compound checks FIRST (before generic over X.5)

  // Compound: "Vence + Over 1.5" (dominant profile) — must check winner AND goals
  if (nl.includes("vence") && nl.includes("over 1.5")) {
    const favIsHome = label.includes("\uD83C\uDFE0"); // 🏠
    const favWon = favIsHome ? home > away : away > home;
    return favWon && ft >= 2 ? "win" : "lose";
  }

  // Compound: "Over 2.5 + Ambas Marcam" — both conditions required
  if (nl.includes("over 2.5") && (nl.includes("ambas marcam") || nl.includes("btts"))) {
    return ft >= 3 && home >= 1 && away >= 1 ? "win" : "lose";
  }

  // Simple goals markets
  if (nl.includes("over 1.5")) return ft >= 2 ? "win" : "lose";
  if (nl.includes("over 2.5")) return ft >= 3 ? "win" : "lose";
  if (nl.includes("under 2.5")) return ft <= 2 ? "win" : "lose";
  if (nl.includes("ambas marcam") || nl.includes("btts")) return home >= 1 && away >= 1 ? "win" : "lose";
  if (nl.includes("casa") && nl.includes("mais de 1.5")) return home >= 2 ? "win" : "lose";
  if (nl.includes("visitante") && nl.includes("mais de 1.5")) return away >= 2 ? "win" : "lose";
  
  // HT goals (using HT stats if available)
  if (nl.includes("ht") && nl.includes("over 0.5")) {
    const htGoals = (game.gol05HTH ?? 0) + (game.gol05HTA ?? 0);
    return htGoals >= 1 ? "win" : "lose";
  }
  
  // Corners — resolved by PackBall historical average (cantHTH/cantHTA/cantFTH/cantFTA)
  // Returns "avg" = historical average covers the line. enrichWithRealStats() upgrades to real win/lose.
  if (nl.includes("canto") || nl.includes("escanteio")) {
    const isFavHome = (game.afH ?? 0) >= (game.afA ?? 0);
    const cantHTFav   = isFavHome ? (game.cantHTH ?? 0) : (game.cantHTA ?? 0);
    const cantHTTotal = (game.cantHTH ?? 0) + (game.cantHTA ?? 0);
    const cantFTTotal = (game.cantFTH ?? 0) + (game.cantFTA ?? 0);
    // Cantos HT favorito
    if (nl.includes("ht") || nl.includes("1t") || nl.includes("1 temp")) {
      if (nl.includes("over 3.5")) return cantHTFav   >= 5 ? "avg" : "no-odd"; // buffer +1
      if (nl.includes("over 2.5")) return cantHTFav   >= 4 ? "avg" : "no-odd";
      if (nl.includes("over 1.5")) return cantHTFav   >= 3 ? "avg" : "no-odd";
      if (nl.includes("over 5.5")) return cantHTTotal >= 7 ? "avg" : "no-odd"; // total HT
      if (nl.includes("over 4.5")) return cantHTTotal >= 6 ? "avg" : "no-odd";
    }
    // Cantos FT total
    if (nl.includes("over 9.5")) return cantFTTotal >= 11 ? "avg" : "no-odd";
    if (nl.includes("over 8.5")) return cantFTTotal >= 10 ? "avg" : "no-odd";
    if (nl.includes("over 7.5")) return cantFTTotal >=  9 ? "avg" : "no-odd";
  }
  
  // Shots on goal HT — resolved by PackBall historical average (chHTH/chHTA)
  // Returns "avg" = met by season average. enrichWithRealStats() upgrades to real win/lose.
  if (nl.includes("finalizac") || nl.includes("chute")) {
    const shots = game.afH >= game.afA ? (game.chHTH ?? 0) : (game.chHTA ?? 0);
    if (nl.includes("over 6.5")) return shots >= 7 ? "avg" : "no-odd";
    if (nl.includes("over 5.5")) return shots >= 6 ? "avg" : "no-odd";
    if (nl.includes("over 4.5")) return shots >= 5 ? "avg" : "no-odd";
    if (nl.includes("over 3.5")) return shots >= 4 ? "avg" : "no-odd";
    if (nl.includes("over 2.5")) return shots >= 3 ? "avg" : "no-odd";
  }
  
  // Winner (1X2) — resolve using actual match score + emoji (🏠 = home, ✈️ = away)
  if (nl.includes("vence")) {
    if (home === 0 && away === 0 && game.resultHome === undefined) return "no-odd";
    const favIsHome = label.includes("\uD83C\uDFE0"); // 🏠
    const favWon = favIsHome ? home > away : away > home;
    const isDraw = home === away;
    if (isDraw) return "lose"; // draw = fav didn't win
    return favWon ? "win" : "lose";
  }
  
  return "no-odd";
}

/**
 * Processa jogos NS (Not Started) — caminho pré-live.
 * Aplica engine completo (score, profile, mercados, favorito, poison)
 * mas NÃO resolve resultado (resultado = "no-odd" / pendente).
 */
export function processNSGames(csvText: string): BetResult[] {
  const { games } = parseCSV(csvText);
  // Pegar TODOS os jogos (NS, FT, etc.)
  const results: BetResult[] = [];

  for (const g of games) {
    const score = computeScore(g);
    const scoreVal = typeof score === 'number' ? score : score?.score ?? 0;
    const profile = classifyProfile(g);
    const main = suggestMainMarket(g);
    if (!main) continue; // score < 0.50 → bloqueado
    const combo = suggestCombo(g);
    const confidence = computeConfidence(g).score;
    const fav = getFavorito(g);
    const poison = detectPoisonTriggers(g);

    const mainOddRaw = getOddForLabel(g, main.label);
    const mainMinOdd = getMinOddForLabel(main.label);
    // Fallback: usar odd estimada quando CSV não tem (Finalizações HT, Cantos HT)
    const mainOdd = (typeof mainOddRaw === 'number' && mainOddRaw > 1) ? mainOddRaw : mainMinOdd;
    const valueAnalysis = calculateValueBet(g, main.label, mainOdd);
    const isFT = g.status === 'FT';

    // Para jogos FT, resolver resultado; para NS, manter "no-odd"
    const mainResult = isFT ? resolveMarketResult(main.label, g) : "no-odd";
    const stake = 25; // STAKE_FIXA
    const mainProfit = mainResult === "win" ? (mainOdd ?? 0) * stake - stake
                     : mainResult === "lose" ? -stake : 0;

    const comboResults = combo.map(item => {
      const oddRaw = getOddForLabel(g, item.label);
      const minOdd = getMinOddForLabel(item.label);
      // Fallback: usar odd estimada quando CSV não tem
      const odd = (typeof oddRaw === 'number' && oddRaw > 1) ? oddRaw : minOdd;
      const val = calculateValueBet(g, item.label, odd);
      const result = isFT ? resolveMarketResult(item.label, g) : "no-odd";
      const profit = result === "win" ? (odd ?? 0) * stake - stake
                   : result === "lose" ? -stake : 0;
      return { label: item.label, odd, minOdd, stake, result, profit, hasValue: !!val?.hasValue };
    });

    results.push({
      id: String(g.id),
      match: g.match,
      league: g.league,
      hour: g.hour,
      status: g.status,
      resultHome: g.resultHome ?? 0,
      resultAway: g.resultAway ?? 0,
      ftGoals: (g.resultHome ?? 0) + (g.resultAway ?? 0),
      mainMarket: {
        label: main.label,
        odd: mainOdd,
        minOdd: mainMinOdd,
        stake,
        result: mainResult,
        profit: mainProfit,
        hasValue: !!valueAnalysis?.hasValue,
      },
      combo: comboResults,
      score: scoreVal,
      profile,
      confidence,
      favorito: fav,
      poison,
    });
  }

  return results;
}

function stakeByConfidence(confidence: number): number {
  if (confidence >= 0.75) return 2;
  if (confidence >= 0.60) return 1;
  if (confidence >= 0.50) return 0.5;
  return 0; // não aposta
}

export function runBacktest(csvText: string, options: { useRiskManagement?: boolean; bankroll?: number; maxDailyStake?: number } = {}): { results: BetResult[]; summary: BacktestSummary } {
  const { games } = parseCSV(csvText);
  const ftGames = games.filter(g => g.status === "FT");
  const results: BetResult[] = [];
  const { useRiskManagement = false, bankroll = 1000, maxDailyStake = 10 } = options;
  
  // Track daily stakes for risk management
  const dailyStakes: Record<string, number> = {};

  for (const g of ftGames) {
    // Check if we should skip this bet
    const shouldSkip = shouldSkipBet(g);
    if (useRiskManagement && shouldSkip) {
      continue; // Skip this game
    }
    
    const score = computeScore(g);
    const profile = classifyProfile(g);
    const main = suggestMainMarket(g);
    if (!main) continue; // Skip games without market suggestion
    const combo = suggestCombo(g);
    const confidence = computeConfidence(g).score;
    const baseStake = stakeByConfidence(confidence);
    
    // Apply risk management if enabled
    let stake = baseStake;
    if (useRiskManagement) {
      const dayKey = g.hour?.split(':')[0] || 'unknown';
      const currentDayStake = dailyStakes[dayKey] || 0;
      stake = calculateRiskAdjustedStake(g, baseStake, bankroll, currentDayStake, maxDailyStake);
      dailyStakes[dayKey] = (dailyStakes[dayKey] || 0) + stake;
    }
    
    // Skip if stake is 0
    if (stake <= 0) continue;

    const mainOdd = getOddForLabel(g, main.label);
    const mainMinOdd = getMinOddForLabel(main.label);
    const valueAnalysis = calculateValueBet(g, main.label, mainOdd);
    const mainHasValue = valueAnalysis.hasValue;
    const mainResult = resolveMarketResult(main.label, g);
    const mainProfit = (mainResult === "win" || mainResult === "avg") ? (mainOdd ?? 0) * stake - stake : mainResult === "lose" ? -stake : 0;

    const comboResults = combo.map(item => {
      const odd = getOddForLabel(g, item.label);
      const minOdd = getMinOddForLabel(item.label);
      const valueAnalysis = calculateValueBet(g, item.label, odd);
      const hasValue = valueAnalysis.hasValue;
      const result = resolveMarketResult(item.label, g);
      const profit = (result === "win" || result === "avg") ? (odd ?? 0) * stake - stake : result === "lose" ? -stake : 0;
      return { label: item.label, odd, minOdd, stake, result, profit, hasValue };
    });

    results.push({
      id: String(g.id),
      match: g.match,
      league: g.league,
      hour: g.hour,
      status: g.status,
      resultHome: g.resultHome ?? 0,
      resultAway: g.resultAway ?? 0,
      ftGoals: (g.resultHome ?? 0) + (g.resultAway ?? 0),
      mainMarket: {
        label: main.label,
        odd: mainOdd,
        minOdd: mainMinOdd,
        stake,
        result: mainResult,
        profit: mainProfit,
        hasValue: mainHasValue,
      },
      combo: comboResults,
      score: getScore(g),
      profile,
      confidence,
      favorito: getFavorito(g),
      poison: detectPoisonTriggers(g),
    });
  }

  const summary = computeSummary(results);
  return { results, summary };
}

// ─── Real-stats enrichment ─────────────────────────────────────────────────────

function resolveWithRealStats(label: string, real: RealStats): "win" | "lose" | "push" | "no-odd" | "pending_manual" {
  const nl = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

  // 🆕 Debug de validação desabilitado para reduzir poluição visual
  // if (process.env.NODE_ENV === 'development') {
  //   console.log(`[VALIDATION-DEBUG] Resolvendo mercado: ${label}`, {
  //     label,
  //     realStats: real,
  //     shotsHTFav: real.shotsHTFav,
  //     totalShotsHTFav: real.totalShotsHTFav,
  //     cornersHTFav: real.cornersHTFav,
  //     cornersHTTotal: real.cornersHTTotal,
  //     shotsHTSource: real.shotsHTSource,
  //     cornersSource: real.cornersSource
  //   });
  // }

  // 🆕 TAREFA 1: Lógica de 'Dado Ausente'
  // Verificar se dados HT são null, undefined ou 0
  const isShotsDataAbsent = real.shotsHTFav === null || real.shotsHTFav === undefined || real.shotsHTFav === 0;
  const isCornersDataAbsent = (nl.includes("canto") || nl.includes("escanteio")) && 
    (real.cornersHTFav === null || real.cornersHTFav === undefined);

  // Finalizações HT (shots on goal by favorite in 1st half)
  if (nl.includes("finalizac") || nl.includes("chute")) {
    const shots = real.shotsHTFav;
    const totalShots = real.totalShotsHTFav;
    // Debug desabilitado para reduzir poluição visual
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`[VALIDATION-DEBUG] Finalizações HT: ${shots} (source: ${real.shotsHTSource}) | Total: ${totalShots}`);
    // }
    
    // 🆕 Se dado ausente, retornar pending_manual
    if (isShotsDataAbsent) {
      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[VALIDATION-DEBUG] Dado de finalizações ausente → PENDING_MANUAL`);
      // }
      return "pending_manual";
    }
    
    // 🆕 Mapeamento alternativo: usar totalShots se shotsHTFav for 0
    const effectiveShots = shots > 0 ? shots : totalShots;
    if (shots === 0 && totalShots > 0) {
      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[VALIDATION-DEBUG] Usando totalShots (${totalShots}) como fallback para shotsHTFav=0`);
      // }
    }
    
    if (nl.includes("over 6.5")) return effectiveShots >= 7 ? "win" : "lose";
    if (nl.includes("over 5.5")) return effectiveShots >= 6 ? "win" : "lose";
    if (nl.includes("over 4.5")) return effectiveShots >= 5 ? "win" : "lose";
    if (nl.includes("over 3.5")) return effectiveShots >= 4 ? "win" : "lose";
    if (nl.includes("over 2.5")) return effectiveShots >= 3 ? "win" : "lose";
  }

  // Cantos HT (corners earned by favorite in 1st half)
  if (nl.includes("canto") || nl.includes("escanteio")) {
    if (nl.includes("ht") || nl.includes("1 temp")) {
      const c = real.cornersHTFav;
      // Debug desabilitado para reduzir poluição visual
      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[VALIDATION-DEBUG] Cantos HT favorito: ${c} (source: ${real.cornersSource})`);
      // }
      
      // 🆕 Se dado ausente, retornar pending_manual
      if (isCornersDataAbsent) {
        // if (process.env.NODE_ENV === 'development') {
        //   console.log(`[VALIDATION-DEBUG] Dado de cantos ausente → PENDING_MANUAL`);
        // }
        return "pending_manual";
      }
      
      if (nl.includes("over 3.5")) return c >= 4 ? "win" : "lose";
      if (nl.includes("over 2.5")) return c >= 3 ? "win" : "lose";
      if (nl.includes("over 1.5")) return c >= 2 ? "win" : "lose";
      // Total HT cantos
      const tot = real.cornersHTTotal;
      // if (process.env.NODE_ENV === 'development') {
      //   console.log(`[VALIDATION-DEBUG] Cantos HT total: ${tot} (source: ${real.cornersSource})`);
      // }
      if (nl.includes("over 5.5")) return tot >= 6 ? "win" : "lose";
      if (nl.includes("over 4.5")) return tot >= 5 ? "win" : "lose";
    }
    // Cantos FT total
    const ft = real.cornersFTTotal;
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`[VALIDATION-DEBUG] Cantos FT total: ${ft} (source: ${real.cornersSource})`);
    // }
    if (nl.includes("over 9.5")) return ft >= 10 ? "win" : "lose";
    if (nl.includes("over 8.5")) return ft >= 9  ? "win" : "lose";
    if (nl.includes("over 7.5")) return ft >= 8  ? "win" : "lose";
  }

  // Gols HT (Over 0.5 → pelo menos 1 gol nos primeiros 45min)
  if ((nl.includes("ht") || nl.includes("primeiro tempo")) && nl.includes("over 0.5")) {
    const htGoals = real.goalsHTHome + real.goalsHTAway;
    return htGoals >= 1 ? "win" : "lose";
  }
  if ((nl.includes("ht") || nl.includes("primeiro tempo")) && nl.includes("over 1.5")) {
    const htGoals = real.goalsHTHome + real.goalsHTAway;
    return htGoals >= 2 ? "win" : "lose";
  }

  return "no-odd";
}

// 🆕 TAREFA 3: Re-validação em Tempo Real com dados manuais
export function validateWithManualInput(
  label: string, 
  manualInput: { shots?: number; corners?: number }
): "win" | "lose" | "push" | "no-odd" {
  const nl = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  
  console.log(`[MANUAL-VALIDATION] Validando com input manual: ${label}`, manualInput);
  console.log(`[MANUAL-VALIDATION] Tipo do shots:`, typeof manualInput.shots, 'Valor:', manualInput.shots);

  // Finalizações HT com dado manual
  if (nl.includes("finalizac") || nl.includes("chute")) {
    const shots = manualInput.shots;
    if (shots === undefined || shots === null) return "no-odd";
    
    console.log(`[MANUAL-VALIDATION] Finalizações HT manual: ${shots} (tipo: ${typeof shots})`);
    if (nl.includes("over 6.5")) return shots >= 7 ? "win" : "lose";
    if (nl.includes("over 5.5")) return shots >= 6 ? "win" : "lose";
    if (nl.includes("over 4.5")) return shots >= 5 ? "win" : "lose";
    if (nl.includes("over 3.5")) {
      const result = shots >= 4 ? "win" : "lose";
      console.log(`[MANUAL-VALIDATION] Over 3.5: shots=${shots} >= 4? = ${shots >= 4} → ${result}`);
      return result;
    }
    if (nl.includes("over 2.5")) return shots >= 3 ? "win" : "lose";
  }

  // Cantos HT com dado manual
  if (nl.includes("canto") || nl.includes("escanteio")) {
    if (nl.includes("ht") || nl.includes("1 temp")) {
      const corners = manualInput.corners;
      if (corners === undefined || corners === null) return "no-odd";
      
      console.log(`[MANUAL-VALIDATION] Cantos HT manual: ${corners}`);
      if (nl.includes("over 3.5")) return corners >= 4 ? "win" : "lose";
      if (nl.includes("over 2.5")) return corners >= 3 ? "win" : "lose";
      if (nl.includes("over 1.5")) return corners >= 2 ? "win" : "lose";
    }
  }

  return "no-odd";
}

/**
 * Re-resolves all bets that were "no-odd" using real post-match stats from API-Football.
 * Only HT/corners markets are affected — FT goals remain resolved from CSV result.
 */
export function enrichWithRealStats(results: BetResult[], realStatsList: RealStats[]): BetResult[] {
  const byKey: Record<string, RealStats> = {};
  for (const rs of realStatsList) {
    byKey[rs.matchKey] = rs;
  }

  return results.map(r => {
    const key = `${r.match.split(" x ")[0]?.trim() ?? ""}|${r.match.split(" x ")[1]?.trim() ?? ""}`;
    // Try both separator formats ("x" and "vs")
    const keySep = r.match.includes(" x ")
      ? `${r.match.split(" x ")[0].trim()}|${r.match.split(" x ")[1].trim()}`
      : r.match.includes(" vs ")
      ? `${r.match.split(" vs ")[0].trim()}|${r.match.split(" vs ")[1].trim()}`
      : null;

    const real = keySep ? (byKey[keySep] ?? null) : null;
    if (!real) return r;

    const enrichBet = (b: BetResult["mainMarket"]) => {
      if (b.result !== "no-odd" && b.result !== "avg") return b; // already resolved
      const bNl = b.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
      // Finalizações HT: upgrade se tiver dado real (shotsHTFav > 0), independente da fonte
      if ((bNl.includes("finalizac") || bNl.includes("chute")) && (real.shotsHTFav ?? 0) === 0) return b;
      // Cantos HT/FT: only upgrade when API-Football returned real corner events
      if ((bNl.includes("canto") || bNl.includes("escanteio")) && real.cornersSource !== "api") return b;
      const newResult = resolveWithRealStats(b.label, real);
      if (newResult === "no-odd") return b; // still can't resolve
      const profit = newResult === "win"
        ? (b.odd ?? 0) * b.stake - b.stake
        : newResult === "lose" ? -b.stake : 0;
      return { ...b, result: newResult as BetResult["mainMarket"]["result"], profit };
    };

    const enriched = {
      ...r,
      // 🆕 Adicionar campos reais da API para validação
      actualTotalShotsHT: real.totalShotsHTFav,
      actualTotalCornersHT: real.cornersHTTotal,
      mainMarket: enrichBet(r.mainMarket),
      combo: r.combo.map(enrichBet),
    };
    return enriched;
  });
}

function computeSummary(results: BetResult[]): BacktestSummary {
  const allBets = results.flatMap(r => [r.mainMarket, ...r.combo]);
  const totalBets = allBets.length;
  const totalStake = allBets.reduce((s, b) => s + b.stake, 0);
  const totalProfit = allBets.reduce((s, b) => s + b.profit, 0);
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const yield_ = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const wins = allBets.filter(b => b.result === "win").length;
  const hitRate = totalBets > 0 ? (wins / totalBets) * 100 : 0;

  // Drawdown simples (cumulativo)
  let balance = 0;
  let maxBalance = 0;
  let maxDrawdown = 0;
  for (const b of allBets) {
    balance += b.profit;
    if (balance > maxBalance) maxBalance = balance;
    const dd = maxBalance - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Agrupados por perfil
  const byProfile: Record<string, { bets: number; stake: number; profit: number; roi: number; hitRate: number }> = {};
  for (const r of results) {
    const bets = [r.mainMarket, ...r.combo];
    const stake = bets.reduce((s, b) => s + b.stake, 0);
    const profit = bets.reduce((s, b) => s + b.profit, 0);
    const wins = bets.filter(b => b.result === "win").length;
    const count = bets.length;
    if (!byProfile[r.profile]) {
      byProfile[r.profile] = { bets: 0, stake: 0, profit: 0, roi: 0, hitRate: 0 };
    }
    byProfile[r.profile].bets += count;
    byProfile[r.profile].stake += stake;
    byProfile[r.profile].profit += profit;
  }
  for (const k of Object.keys(byProfile)) {
    const p = byProfile[k];
    p.roi = p.stake > 0 ? (p.profit / p.stake) * 100 : 0;
    p.hitRate = p.bets > 0 ? (allBets.filter(b => b.result === "win").length / p.bets) * 100 : 0;
  }

  // Agrupados por mercado
  const byMarket: Record<string, { bets: number; stake: number; profit: number; roi: number; hitRate: number }> = {};
  for (const b of allBets) {
    const key = b.label;
    if (!byMarket[key]) {
      byMarket[key] = { bets: 0, stake: 0, profit: 0, roi: 0, hitRate: 0 };
    }
    byMarket[key].bets += 1;
    byMarket[key].stake += b.stake;
    byMarket[key].profit += b.profit;
  }
  for (const k of Object.keys(byMarket)) {
    const m = byMarket[k];
    m.roi = m.stake > 0 ? (m.profit / m.stake) * 100 : 0;
    m.hitRate = m.bets > 0 ? (allBets.filter(b => b.label === k && b.result === "win").length / m.bets) * 100 : 0;
  }

  // Com/sem valor
  const withValueBets = allBets.filter(b => b.hasValue);
  const withoutValueBets = allBets.filter(b => !b.hasValue);
  const withValue = {
    bets: withValueBets.length,
    stake: withValueBets.reduce((s, b) => s + b.stake, 0),
    profit: withValueBets.reduce((s, b) => s + b.profit, 0),
    roi: withValueBets.reduce((s, b) => s + b.stake, 0) > 0 ? (withValueBets.reduce((s, b) => s + b.profit, 0) / withValueBets.reduce((s, b) => s + b.stake, 0)) * 100 : 0,
    hitRate: withValueBets.length > 0 ? (withValueBets.filter(b => b.result === "win").length / withValueBets.length) * 100 : 0,
  };
  const withoutValue = {
    bets: withoutValueBets.length,
    stake: withoutValueBets.reduce((s, b) => s + b.stake, 0),
    profit: withoutValueBets.reduce((s, b) => s + b.profit, 0),
    roi: withoutValueBets.reduce((s, b) => s + b.stake, 0) > 0 ? (withoutValueBets.reduce((s, b) => s + b.profit, 0) / withoutValueBets.reduce((s, b) => s + b.stake, 0)) * 100 : 0,
    hitRate: withoutValueBets.length > 0 ? (withoutValueBets.filter(b => b.result === "win").length / withoutValueBets.length) * 100 : 0,
  };

  return {
    totalBets,
    totalStake,
    totalProfit,
    roi,
    yield: yield_,
    hitRate,
    maxDrawdown,
    byProfile,
    byMarket,
    withValue,
    withoutValue,
  };
}
