import { parseCSV, getOddForLabel, classifyProfile, getFavorito, computeConfidence, computeScore, calculateValueBet, getMinOddForLabel, suggestMainMarket, suggestCombo, detectPoisonTriggers } from "../engine";
import type { PreMatchOdds } from "./footballApi";

// ── CONSTANTES DE QUALIDADE ──────────────────────────────────────────────────
const MIN_USEFUL_ODD = 1.20; // Odd mínima para uma perna ser operável
const MAX_USEFUL_ODD = 2.50; // Odd máxima — acima disso é risco demais para bilhete "pra bater"
const MIN_COMBINED_ODD: Record<string, number> = {
  bronze: 1.50,    // SEGURO (2 pernas)
  silver: 2.00,    // PADRÃO (3 pernas)
  gold: 3.00,      // FORTE (4 pernas)
  agressivo: 4.00, // AGRESSIVO (5 pernas)
  bingo: 5.00,     // BINGO (6 pernas)
};
const MAX_COMBINED_ODD: Record<string, number> = {
  bronze: 4.00,    // SEGURO: teto 4x
  silver: 7.00,    // PADRÃO: teto 7x
  gold: 12.00,     // FORTE: teto 12x
  agressivo: 18.00,// AGRESSIVO: teto 18x
  bingo: 30.00,    // BINGO: teto 30x
};
// Qualidade mínima por jogo (gate de entrada)
const MIN_SCORE = 0.65;  // Score ≥ 65%
const MIN_CONF  = 0.55;  // Confiança ≥ 55%

export interface LiveMultipleSuggestion {
  id: string;
  type: "bronze" | "silver" | "gold";
  confidence: number;
  expectedValue: number;
  riskLevel: "low" | "medium" | "high";
  selections: Array<{
    match: string;
    league: string;
    hour: string;
    market: string;
    odd: number;
    minOdd: number;
    hasValue: boolean;
    edge: number;
    recommendation: string;
    reason: string;
    gameProfile: string;
    confidence: number;
    oddTag?: string; // 🆕 Tag visual: "SEM ODD", "ODD BAIXA"
  }>;
  combinedOdd: number;
  suggestedStake: number;
  expectedReturn: number;
  riskReward: string;
}

// Analisador Pré-Live - Versão 100% funcional
export class PreLiveMultipleAnalyzer {
  private static instance: PreLiveMultipleAnalyzer;
  private static suggestionCounter = 0; // Contador para chaves únicas

  // 🆕 Mapa de odds reais injetadas via API-Football
  private realOddsMap: Record<string, Record<string, number>> = {}; // matchKey → { marketLabel → odd }

  static getInstance(): PreLiveMultipleAnalyzer {
    if (!PreLiveMultipleAnalyzer.instance) {
      PreLiveMultipleAnalyzer.instance = new PreLiveMultipleAnalyzer();
    }
    return PreLiveMultipleAnalyzer.instance;
  }

  private historicalPatterns: Record<string, { successRate: number; avgOdd: number; roi: number; }> = {};
  
  // Campeonatos que não devem ter finalizações HT sugeridas
  private excludedLeaguesForHT: string[] = [
    "League One",
    "AFC Champions League Elite",
    "Eredivisie",
    "Europa Conference League",
    "Pro League",
    "Eerste Divisie",
    "Super Lig"
  ];

  constructor() {
    // Padrões históricos comprovados
    this.historicalPatterns = {
      'Finalizacoes_HT': { successRate: 100, avgOdd: 1.22, roi: 43.2 },
      'Gols_HT': { successRate: 100, avgOdd: 1.23, roi: 46.9 },
      'Corner_Dominant': { successRate: 100, avgOdd: 1.16, roi: 32.5 },
      'Over15_FT': { successRate: 100, avgOdd: 1.20, roi: 40.0 },
      'Over25_BTTS': { successRate: 100, avgOdd: 1.60, roi: 120.0 }
    };
  }

  // ✅ Verifica se o campeonato permite finalizações HT
  private allowsHTFinalizations(league: string): boolean {
    return !this.excludedLeaguesForHT.some(excluded => 
      league.toLowerCase().includes(excluded.toLowerCase())
    );
  }

  /** Injeta odds reais obtidas da API-Football */
  injectRealOdds(oddsMap: Record<number, PreMatchOdds>, fixtureMap: Record<string, number>): void {
    this.realOddsMap = {};
    for (const [matchKey, fixtureId] of Object.entries(fixtureMap)) {
      const odds = oddsMap[fixtureId];
      if (odds?.markets) {
        this.realOddsMap[matchKey] = odds.markets;
      }
    }
    console.log(`[ODDS-INJECT] ${Object.keys(this.realOddsMap).length} jogos com odds reais injetadas`);
  }

  /** Busca a melhor odd disponível para um mercado: real API > CSV > null */
  private getBestOdd(game: any, marketLabel: string): number | null {
    const matchKey = game?.match || `${game?.home || ''} x ${game?.away || ''}`;
    
    // 1. Tentar odd real da API-Football
    const realMarkets = this.realOddsMap[matchKey];
    if (realMarkets) {
      // Busca exata
      if (realMarkets[marketLabel]) return realMarkets[marketLabel];
      
      // Busca fuzzy: "Finalizações HT Over 5.5" → procurar "Over 5.5" nos mercados reais
      const nl = marketLabel.toLowerCase();
      for (const [key, odd] of Object.entries(realMarkets)) {
        const nk = key.toLowerCase();
        // Match Over X.5 lines
        const lineMatch = nl.match(/over\s+(\d+\.\d+)/);
        if (lineMatch && nk.includes(`over ${lineMatch[1]}`)) {
          // Verificar se é o mesmo tipo de mercado
          if (nl.includes('finaliz') && nk.includes('finaliz')) return odd;
          if (nl.includes('canto') && nk.includes('canto')) return odd;
          if (nl.includes('gol') && nk.includes('gol')) return odd;
          if (nl.includes('ft') && nk.includes('ft') && !nl.includes('canto')) return odd;
        }
        if (nl.includes('ambas marcam') && nk.includes('ambas marcam')) return odd;
        if (nl.includes('btts') && nk.includes('btts')) return odd;
      }
    }
    
    // 2. Fallback: odd do CSV
    const csvOdd = getOddForLabel(game, marketLabel);
    return (typeof csvOdd === 'number' && !isNaN(csvOdd) && csvOdd > 1) ? csvOdd : null;
  }

  // Pontua especificidade de um mercado: HT por time > HT total > FT específico > FT genérico
  private marketSpecificity(label: string): number {
    const l = label.toLowerCase();
    // Finalizações HT por time (ex: "Arsenal — Finalizações HT Over 5.5")
    if ((l.includes('finaliz') || l.includes('chute')) && l.includes('ht')) return 100;
    // Cantos HT por time (ex: "Arsenal — Over 3.5 Cantos HT")
    if ((l.includes('canto') || l.includes('escanteio')) && l.includes('ht')) return 90;
    // Blitz HT
    if (l.includes('blitz')) return 95;
    // Cantos FT (ex: "Over 8.5 Cantos FT")
    if (l.includes('canto') || l.includes('escanteio')) return 70;
    // Gols HT com time (ex: "Vence + Over 0.5 HT")
    if (l.includes('ht') && l.includes('vence')) return 60;
    // Over 2.5 FT / BTTS
    if (l.includes('over 2.5') || l.includes('ambas marcam') || l.includes('btts')) return 40;
    // Over 1.5 FT / Vence genérico — último recurso
    if (l.includes('over 1.5')) return 10;
    if (l.includes('vence')) return 20;
    return 30;
  }

  // 🔧 Seleção inteligente: linhas específicas (HT por time) primeiro, genéricas por último
  private getSafeSelection(game: any, usedSignatures: Set<string>): any {
    const combo = suggestCombo(game) || [];
    const main = suggestMainMarket(game);

    // Juntar todos os candidatos: combo (específicos) + mainMarket (fallback)
    const allCandidates = [...combo];
    if (main?.label) allCandidates.push(main);

    // Ordenar por especificidade decrescente
    allCandidates.sort((a, b) => this.marketSpecificity(b.label) - this.marketSpecificity(a.label));

    for (const opt of allCandidates) {
      if (!opt || !opt.label) continue;
      if (!this.isLabelAllowed(opt.label, game.league || '')) continue;
      const bestOdd = this.getBestOdd(game, opt.label);
      if (!this.isOddInRange(bestOdd)) continue;
      const signature = `${game.home}_${opt.label}`;
      if (!usedSignatures.has(signature)) {
        usedSignatures.add(signature);
        return { ...opt, _resolvedOdd: bestOdd };
      }
    }
    return null;
  }

  // Verifica se label é permitida para a liga
  private isLabelAllowed(label: string, league: string): boolean {
    const l = label.toLowerCase();
    const isHT = l.includes('finaliza') || l.includes('chute') ||
      ((l.includes('canto') || l.includes('escanteio')) && l.includes('ht'));
    if (isHT && !this.allowsHTFinalizations(league)) return false;
    return true;
  }

  // Verifica se odd está na faixa operável (1.20–2.50)
  private isOddInRange(odd: number | null): boolean {
    if (!odd || odd < MIN_USEFUL_ODD) return false;
    if (odd > MAX_USEFUL_ODD) return false;
    return true;
  }

  // Analisa CSV do dia para gerar múltiplas pré-live
  analyzeLiveMultiples(csvText: string, oddsMap?: Record<number, PreMatchOdds>, fixtureMap?: Record<string, number>): {
    suggestions: LiveMultipleSuggestion[];
    summary: {
      totalGames: number;
      qualityGames: number;
      confluencePairs: number;
      avgConfidence: number;
    };
  } {
    try {
      const { games } = parseCSV(csvText);
      console.log(`📊 ${games.length} jogos encontrados no CSV`);
      
      // Filtra jogos que ainda não começaram
      const upcomingGames = games.filter(g => g.status === "NS" || !g.status);
      console.log(`🎯 ${upcomingGames.length} jogos disponíveis para análise pré-live`);
      
      // 🚫 FILTRO DE QUALIDADE — Score ≥ 65% E Confiança ≥ 55%
      const qualityGames = upcomingGames.filter(g => {
        const scoreResult = computeScore(g);
        const score = typeof scoreResult === 'number' ? scoreResult : scoreResult?.score || 0;
        const confResult = computeConfidence(g);
        const conf = confResult?.score || 0;
        return score >= MIN_SCORE && conf >= MIN_CONF;
      });
      console.log(`⭐ ${qualityGames.length} jogos com qualidade (score≥${MIN_SCORE*100}%, conf≥${MIN_CONF*100}%)`);
      
      if (qualityGames.length < 2) {
        return {
          suggestions: [],
          summary: {
            totalGames: upcomingGames.length,
            qualityGames: qualityGames.length,
            confluencePairs: 0,
            avgConfidence: 0
          }
        };
      }
      
      // 🆕 Injeta odds reais se fornecidas
      if (oddsMap && fixtureMap) {
        this.injectRealOdds(oddsMap, fixtureMap);
      }
      
      // Gera múltiplas baseadas em confluência de perfis
      const suggestions = this.generateQualityMultiples(qualityGames);
      console.log(` ${suggestions.length} múltiplas geradas por confluência`);
      
      return {
        suggestions,
        summary: {
          totalGames: upcomingGames.length,
          qualityGames: qualityGames.length,
          confluencePairs: suggestions.length,
          avgConfidence: suggestions.reduce((acc, s) => acc + s.confidence, 0) / suggestions.length || 0
        }
      };
    } catch (error) {
      console.error(' Erro na análise pré-live:', error);
      return {
        suggestions: [],
        summary: {
          totalGames: 0,
          qualityGames: 0,
          confluencePairs: 0,
          avgConfidence: 0
        }
      };
    }
  }

  private generateQualityMultiples(games: any[]): LiveMultipleSuggestion[] {
    const suggestions: LiveMultipleSuggestion[] = [];

    // Ordenar: Poison primeiro, depois por score decrescente
    const topGames = [...games].sort((a, b) => {
      const poisonA = detectPoisonTriggers(a);
      const poisonB = detectPoisonTriggers(b);
      // Poison ativo sobe ao topo
      if (poisonA.isPoison && !poisonB.isPoison) return -1;
      if (!poisonA.isPoison && poisonB.isPoison) return 1;
      // Dentro dos Poison, nível mais forte primeiro
      if (poisonA.isPoison && poisonB.isPoison) {
        if (poisonA.highestLevel !== poisonB.highestLevel) return poisonA.highestLevel - poisonB.highestLevel;
      }
      // Depois por score
      const sA = computeScore(a); const sB = computeScore(b);
      const scoreA = typeof sA === 'number' ? sA : (sA as any)?.score || 0;
      const scoreB = typeof sB === 'number' ? sB : (sB as any)?.score || 0;
      return scoreB - scoreA;
    });

    if (topGames.length < 2) return suggestions;

    // Função para construir seleção
    const buildSelection = (g: any, marketLabel: string, baseReason: string) => {
      const odd = this.getBestOdd(g, marketLabel);
      const confResult = computeConfidence(g);
      const conf = (confResult as any)?.score || 0;
      const scoreResult = computeScore(g);
      const score = typeof scoreResult === 'number' ? scoreResult : (scoreResult as any)?.score || 0;
      const profile = classifyProfile(g);
      const fav = getFavorito(g);
      const poison = detectPoisonTriggers(g);
      const hasOdd = typeof odd === "number" && !isNaN(odd) && odd > 1;

      const poisonTag = poison.isPoison ? ` ${poison.primaryTrigger?.icon} ${poison.primaryTrigger?.tag}` : '';

      return {
        match: g?.match || `${g?.home || ""} x ${g?.away || ""}`.trim(),
        league: g?.league || "—",
        hour: g?.hour || "—",
        market: marketLabel,
        odd: hasOdd ? odd : 0,
        minOdd: 0,
        hasValue: hasOdd,
        edge: 0,
        recommendation: hasOdd ? "Operável" : "Sem odd",
        oddTag: !hasOdd ? "SEM ODD" : "",
        reason: `${baseReason}${poisonTag}`,
        gameProfile: profile || "generic",
        confidence: Math.round(conf * 100),
        _meta: { score, fav: (fav as any)?.nome || "" },
      } as any;
    };

    // Pool GLOBAL — mesmo jogo NÃO repete entre bilhetes (1 perna perde ≠ mata 2 bilhetes)
    const globalUsedGames = new Set<string>();
    const globalUsedSigs  = new Set<string>();

    const buildTicket = (
      nLegs: number,
      typeId: string,
      riskLevel: LiveMultipleSuggestion['riskLevel'],
      stake: number,
      reason: string
    ): LiveMultipleSuggestion | null => {
      const selections: any[] = [];
      for (const g of topGames) {
        if (selections.length >= nLegs) break;
        // Mesmo JOGO não pode aparecer em bilhetes diferentes
        const gameKey = g.home || g.match || '';
        if (globalUsedGames.has(gameKey)) continue;
        const sel = this.getSafeSelection(g, globalUsedSigs);
        if (sel) {
          selections.push(buildSelection(g, sel.label, reason));
          globalUsedGames.add(gameKey);
        }
      }
      if (selections.length < Math.min(nLegs, 2)) return null;

      // Todas as pernas devem ter odd
      const allHaveOdds = selections.every((s: any) => s.odd > 1);
      if (!allHaveOdds) return null;

      const combinedOdd = selections.reduce((acc: number, s: any) => acc * s.odd, 1);

      // Filtro de odd combinada: piso e teto
      const minCombined = MIN_COMBINED_ODD[typeId] || 1.50;
      const maxCombined = MAX_COMBINED_ODD[typeId] || 10.0;
      if (combinedOdd < minCombined || combinedOdd > maxCombined) return null;

      const avgConf = selections.reduce((acc: number, s: any) => acc + (s.confidence / 100), 0) / selections.length;
      const expectedValue = (combinedOdd * avgConf) - 1;
      return {
        id: `${typeId}_${Date.now()}_${++PreLiveMultipleAnalyzer.suggestionCounter}`,
        type: typeId as any,
        confidence: Math.round(avgConf * 100),
        expectedValue,
        riskLevel,
        selections,
        combinedOdd,
        suggestedStake: stake,
        expectedReturn: combinedOdd * stake,
        riskReward: expectedValue > 0.08 ? "Excelente" : expectedValue > 0.04 ? "Bom" : "Moderado",
      };
    };

    // 5 perfis de bilhete — cada perna filtrada por confluência real (odd 1.20–2.50)
    const seguro = buildTicket(2, 'bronze', 'low', 50, '🛡️ Seguro');
    if (seguro) suggestions.push(seguro);

    const padrao = buildTicket(3, 'silver', 'low', 35, '⚖️ Padrão');
    if (padrao) suggestions.push(padrao);

    const forte = buildTicket(4, 'gold', 'medium', 25, '💪 Forte');
    if (forte) suggestions.push(forte);

    const agressivo = buildTicket(5, 'agressivo', 'medium', 15, '🚀 Agressivo');
    if (agressivo) suggestions.push(agressivo);

    const bingo = buildTicket(6, 'bingo', 'high', 10, '💣 Bingo');
    if (bingo) suggestions.push(bingo);

    return suggestions;
  }
  
  // ENCONTRA PARES COM CONFLUÊNCIA
  private findConfluencePairs(games: any[]): Array<{game1: any, game2: any, synergy: number, type: string}> {
    const pairs = [];
    
    console.log('🔍 ANÁLISE DETALHADA DOS JOGOS QUALIFICADOS:');
    games.forEach((g, i) => {
      const profile = classifyProfile(g);
      const scoreResult = computeScore(g);
      const score = typeof scoreResult === 'number' ? scoreResult : scoreResult?.score || 0;
      const confResult = computeConfidence(g);
      const conf = confResult?.score || 0;
      console.log(`Jogo ${i+1}: ${g.match} | Perfil: ${profile} | Score: ${(score * 100).toFixed(0)}% | Conf: ${(conf * 100).toFixed(0)}%`);
    });
    
    for (let i = 0; i < games.length; i++) {
      for (let j = i + 1; j < games.length; j++) {
        const game1 = games[i];
        const game2 = games[j];
        
        const profile1 = classifyProfile(game1);
        const profile2 = classifyProfile(game2);
        
        const synergy = this.calculateSynergy(profile1, profile2, game1, game2);
        
        console.log(`🔗 ${game1.match} (${profile1}) + ${game2.match} (${profile2}) = ${synergy}%`);
        
        // 🔥 FILTRO DE SINERGIA - Reduzido para 55% para máximo de combinações
        if (synergy >= 55) { 
          const type = synergy >= 90 ? 'premium' : synergy >= 80 ? 'standard' : 'conservative';
          pairs.push({ game1, game2, synergy, type });
        }
      }
    }
    
    return pairs;
  }
  
  // 📈 CALCULA SINERGIA ENTRE PERFIS
  private calculateSynergy(profile1: string, profile2: string, game1: any, game2: any): number {
    const confResult1 = computeConfidence(game1);
    const confResult2 = computeConfidence(game2);
    const conf1 = confResult1?.score || 0;
    const conf2 = confResult2?.score || 0;
    const avgConf = (conf1 + conf2) / 2;
    
    // 🎯 TABELA DE SINERGIA POR PERFIS
    const synergyMatrix: {[key: string]: {[key: string]: number}} = {
      'chutes_ht_fav': {
        'chutes_ht_fav': 75, // 🆕 Mesmo perfil - sinergia moderada
        'clear_favorite': 85,
        'dominant': 90,
        'slight_fav_offensive': 80,
        'high_offense_balanced': 75
      },
      'corner_dominant': {
        'corner_dominant': 70, // 🆕 Mesmo perfil
        'high_offense_balanced': 80,
        'balanced_btts': 75,
        'slight_fav_offensive': 70
      },
      'balanced_btts': {
        'balanced_btts': 70, // 🆕 Mesmo perfil
        'slight_fav_offensive': 75,
        'high_offense_balanced': 80,
        'clear_favorite': 70
      },
      'dominant': {
        'any': 90 // Dominante combina com qualquer perfil
      },
      // 🆕 Defaults para outros perfis
      'clear_favorite': {
        'clear_favorite': 70,
        'slight_fav_offensive': 75,
        'high_offense_balanced': 80
      },
      'slight_fav_offensive': {
        'slight_fav_offensive': 70,
        'high_offense_balanced': 75
      },
      'high_offense_balanced': {
        'high_offense_balanced': 70
      }
    };
    
    let baseSynergy = synergyMatrix[profile1]?.[profile2] || 
                      synergyMatrix[profile2]?.[profile1] || 
                      65; // Padrão para combinações não mapeadas
    
    // 🔥 BÔNUS POR CONFIANÇA MÉDIA
    const confidenceBonus = avgConf >= 0.80 ? 10 : avgConf >= 0.70 ? 5 : 0;
    
    // 🚀 BÔNUS POR FORÇA DOS JOGOS
    const scoreResult1 = computeScore(game1);
    const scoreResult2 = computeScore(game2);
    const score1 = typeof scoreResult1 === 'number' ? scoreResult1 : scoreResult1?.score || 0;
    const score2 = typeof scoreResult2 === 'number' ? scoreResult2 : scoreResult2?.score || 0;
    const avgScore = (score1 + score2) / 2;
    const scoreBonus = avgScore >= 0.80 ? 5 : avgScore >= 0.70 ? 3 : 0;
    
    return Math.min(baseSynergy + confidenceBonus + scoreBonus, 95);
  }
  
  // 🎯 CONSTRÓI MÚLTIPLA POR CONFLUÊNCIA
  private buildConfluenceMultiple(pair: {game1: any, game2: any, synergy: number, type: string}, games: any[], usedSignatures: Set<string>): LiveMultipleSuggestion | null {
    const buildSelection = (g: any, marketLabel: string, baseReason: string) => {
      const odd = getOddForLabel(g, marketLabel);
      const confResult = computeConfidence(g);
      const conf = confResult?.score || 0;
      const scoreResult = computeScore(g);
      const score = typeof scoreResult === 'number' ? scoreResult : scoreResult?.score || 0;
      const profile = classifyProfile(g);
      const fav = getFavorito(g);

      const minOddFallback = getMinOddForLabel(marketLabel) ?? 0;
      const value = calculateValueBet(g, marketLabel, odd);
      const minOdd = (value?.minOdd || 0) > 0 ? value.minOdd : minOddFallback;

      const hasOdd = typeof odd === "number" && !isNaN(odd) && odd > 1;
      const edge = hasOdd ? (value?.edge ?? 0) : 0;
      const hasValue = hasOdd ? !!value?.hasValue : false;
      const recommendation = hasOdd ? (value?.recommendation ?? "") : "Sem odd";

      const reasonParts = [baseReason];
      if (hasOdd) {
        reasonParts.push(`${recommendation} · Edge ${edge}%`);
      } else {
        reasonParts.push("Sem odd no CSV");
      }

      return {
        match: g?.match || `${g?.home || ""} x ${g?.away || ""}`.trim(),
        league: g?.league || "—",
        hour: g?.hour || "—",
        market: marketLabel,
        odd: hasOdd ? odd : 0,
        minOdd: minOdd || 0,
        hasValue,
        edge,
        recommendation,
        reason: reasonParts.filter(Boolean).join(" · "),
        gameProfile: profile || "generic",
        confidence: Math.round(conf * 100),
        _meta: {
          score: score,
          fav: fav?.nome || "",
        },
      } as any;
    };

    const finalizeSuggestion = (s: Omit<LiveMultipleSuggestion, "combinedOdd" | "expectedReturn" | "expectedValue" | "confidence" | "riskLevel"> & { selections: any[] }) => {
      const validOdds = s.selections.map(sel => sel.odd).filter((o: any) => typeof o === "number" && o > 1);
      const combinedOdd = validOdds.length === s.selections.length
        ? validOdds.reduce((acc: number, o: number) => acc * o, 1)
        : 0;

      const expectedReturn = combinedOdd > 0 ? s.suggestedStake * combinedOdd : 0;
      const avgEdge = s.selections.length
        ? s.selections.reduce((acc: number, sel: any) => acc + ((sel.edge || 0) / 100), 0) / s.selections.length
        : 0;

      const avgConf = s.selections.length
        ? s.selections.reduce((acc: number, sel: any) => acc + ((sel.confidence || 0) / 100), 0) / s.selections.length
        : 0;

      const anyMissingOdd = s.selections.some(sel => !sel.odd || sel.odd <= 1);
      const lowConf = avgConf < 0.7;

      const riskLevel: LiveMultipleSuggestion["riskLevel"] = anyMissingOdd || lowConf
        ? "high"
        : s.selections.some(sel => !sel.hasValue)
          ? "medium"
          : "low";

      const expectedValue = avgEdge;

      const riskReward = expectedValue > 0.08
        ? "Excelente"
        : expectedValue > 0.04
          ? "Bom"
          : expectedValue > 0.02
            ? "Moderado"
            : "Alto";

      return {
        ...s,
        combinedOdd,
        expectedReturn,
        expectedValue,
        confidence: avgConf,
        riskLevel,
        riskReward,
      } as LiveMultipleSuggestion;
    }
  
    return null;
  }
}

// Função principal para análise pré-live
export function analyzePreLiveMultiples(csvText: string): {
  suggestions: LiveMultipleSuggestion[];
  summary: any;
} {
  const analyzer = new PreLiveMultipleAnalyzer();
  return analyzer.analyzeLiveMultiples(csvText);
}
