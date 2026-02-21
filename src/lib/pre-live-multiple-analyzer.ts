import { parseCSV, getOddForLabel, classifyProfile, getFavorito, computeConfidence, computeScore, calculateValueBet, getMinOddForLabel, suggestMainMarket, suggestCombo } from "../engine";

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

  // 🔧 Mover função para método da classe para ter acesso ao this
  private getUniqueSelection(game: any, usedSignatures: Set<string>): any {
    const options = suggestCombo(game) || [];
    for (const opt of options) {
      if (!opt || !opt.label) continue;
      
      const labelLower = opt.label.toLowerCase();
      const isHTFinalization = labelLower.includes('finaliza') || labelLower.includes('chute');
      const isHTCorner = (labelLower.includes('canto') || labelLower.includes('escanteio')) && labelLower.includes('ht');

      // 🚫 BLOQUEIO: liga não permite HT
      if ((isHTFinalization || isHTCorner) && !this.allowsHTFinalizations(game.league || '')) {
        console.log(`[SECURITY-FILTER] Bloqueando HT para liga: ${game.league}`);
        continue;
      }


      const signature = `${game.home}_${opt.label}`;
      if (!usedSignatures.has(signature)) {
        usedSignatures.add(signature);
        return opt;
      }
    }
    return null;
  }

  // Analisa CSV do dia para gerar múltiplas pré-live
  analyzeLiveMultiples(csvText: string): {
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
      
      // 🚫 FILTRO DE QUALIDADE - Score >= 60% E Confiança >= 55%
      const qualityGames = upcomingGames.filter(g => {
        const scoreResult = computeScore(g);
        const score = typeof scoreResult === 'number' ? scoreResult : scoreResult?.score || 0;
        const confResult = computeConfidence(g);
        const conf = confResult?.score || 0;
        
        // 🆕 DEBUG: Mostrar scores de cada jogo
        console.log(`🔍 ${g.home} vs ${g.away} - Score: ${(score * 100).toFixed(1)}%, Conf: ${(conf * 100).toFixed(1)}%`);
        
        // 🎯 AJUSTE AGRESSIVO: Score ≥55% E Confiança ≥45% (máximo de jogos)
        return score >= 0.55 && conf >= 0.45;
      });
      console.log(`⭐ ${qualityGames.length} jogos com qualidade (score≥55%, conf≥45%)`);
      
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
      
      // Gera múltiplas baseadas em confluência de perfis
      const suggestions = this.generateQualityMultiples(qualityGames);
      console.log(`🎯 ${suggestions.length} múltiplas geradas por confluência`);
      
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

    // Ordenar jogos por score decrescente
    const topGames = [...games].sort((a, b) => {
      const sA = computeScore(a); const sB = computeScore(b);
      const scoreA = typeof sA === 'number' ? sA : (sA as any)?.score || 0;
      const scoreB = typeof sB === 'number' ? sB : (sB as any)?.score || 0;
      return scoreB - scoreA;
    });

    if (topGames.length < 1) return suggestions;

    // Função para construir seleção
    const buildSelection = (g: any, marketLabel: string, baseReason: string) => {
      const odd = getOddForLabel(g, marketLabel);
      const confResult = computeConfidence(g);
      const conf = (confResult as any)?.score || 0;
      const scoreResult = computeScore(g);
      const score = typeof scoreResult === 'number' ? scoreResult : (scoreResult as any)?.score || 0;
      const profile = classifyProfile(g);
      const fav = getFavorito(g);
      const minOddFallback = getMinOddForLabel(marketLabel) ?? 0;
      const value = calculateValueBet(g, marketLabel, odd);
      const minOdd = (value?.minOdd || 0) > 0 ? value.minOdd : minOddFallback;
      const hasOdd = typeof odd === "number" && !isNaN(odd) && odd > 1;
      const edge = hasOdd ? (value?.edge ?? 0) : 0;
      const hasValue = hasOdd ? !!value?.hasValue : false;
      const recommendation = hasOdd ? (value?.recommendation ?? "") : "Sem odd";
      return {
        match: g?.match || `${g?.home || ""} x ${g?.away || ""}`.trim(),
        league: g?.league || "—",
        hour: g?.hour || "—",
        market: marketLabel,
        odd: hasOdd ? odd : 0,
        minOdd: minOdd || 0,
        hasValue, edge, recommendation,
        reason: [baseReason, hasOdd ? `${recommendation} · Edge ${edge}%` : "Sem odd no CSV"].filter(Boolean).join(" · "),
        gameProfile: profile || "generic",
        confidence: Math.round(conf * 100),
        _meta: { score, fav: (fav as any)?.nome || "" },
      } as any;
    };

    // usedSignatures GLOBAL — mesma linha (jogo+mercado) não repete entre bilhetes
    // Mesmo jogo com mercado DIFERENTE pode aparecer em outro bilhete (assinatura = jogo_mercado)
    const globalUsed = new Set<string>();

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
        const sel = this.getUniqueSelection(g, globalUsed); // usa o set global
        if (sel) selections.push(buildSelection(g, sel.label, reason));
      }
      if (selections.length < Math.min(nLegs, 2)) return null; // mínimo 2 pernas
      const combinedOdd = selections.reduce((acc, s) => acc * (s.odd > 1 ? s.odd : 1), 1);
      const avgConf = selections.reduce((acc, s) => acc + (s.confidence / 100), 0) / selections.length;
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

    // ── NÍVEL 1: SEGURO — 2 pernas, stake R$50 ───────────────────────────
    const seguro = buildTicket(2, 'bronze', 'low', 50, '🛡️ Seguro: alta probabilidade');
    if (seguro) suggestions.push(seguro);

    // ── NÍVEL 2: PADRÃO — 3 pernas, stake R$35 ───────────────────────────
    const padrao = buildTicket(3, 'silver', 'medium', 35, '⚖️ Padrão: risco balanceado');
    if (padrao) suggestions.push(padrao);

    // ── NÍVEL 3: FORTE — 4 pernas, stake R$25 ────────────────────────────
    const forte = buildTicket(4, 'gold', 'medium', 25, '💪 Forte: confluência de perfis');
    if (forte) suggestions.push(forte);

    // ── NÍVEL 4: AGRESSIVO — 5 pernas, stake R$15 ────────────────────────
    const agressivo = buildTicket(5, 'agressivo', 'high', 15, '🚀 Agressivo: alavancagem');
    if (agressivo) suggestions.push(agressivo);

    // ── NÍVEL 5: BINGO — 6 pernas, stake R$10 ────────────────────────────
    const bingo = buildTicket(6, 'bingo', 'high', 10, '💣 Bingo: máxima alavancagem');
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
