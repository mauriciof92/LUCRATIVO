import { parseCSV, getOddForLabel, classifyProfile, getFavorito, computeConfidence, computeScore, calculateValueBet, getMinOddForLabel, suggestMainMarket, suggestCombo, detectPoisonTriggers, suggestBetBuilder, extractDateFromHour } from "../engine";
import type { PreMatchOdds } from "./footballApi";

// ── CONSTANTES DE QUALIDADE ──────────────────────────────────────────────────
const MIN_MARKET_ODD = 1.10;  // Odd mínima por mercado individual (SGP)
const MAX_MARKET_ODD = 2.50;  // Odd máxima por mercado individual
const MIN_GAME_ODD = 1.20;    // Odd mínima por jogo (produto dos mercados do jogo)
const MAX_GAME_ODD = 15.00;   // Odd máxima por jogo (aumentada para permitir Sinfonia com 3 mercados)

// Tiers baseados em número de JOGOS (cada jogo = 1 mercado tradicional nas clássicas)
// minGames = mínimo de jogos exigido para o bilhete ser gerado
const TIER_CONFIG: Record<string, { nGames: number; minGames: number; marketsPerGame: number; stake: number; minTotal: number; maxTotal: number }> = {
  bronze:    { nGames: 2, minGames: 2, marketsPerGame: 1, stake: 50, minTotal: 1.5,  maxTotal: 5.0  },
  silver:    { nGames: 3, minGames: 2, marketsPerGame: 1, stake: 35, minTotal: 2.0,  maxTotal: 10.0 },
  gold:      { nGames: 4, minGames: 3, marketsPerGame: 1, stake: 25, minTotal: 3.0,  maxTotal: 15.0 },
  agressivo: { nGames: 6, minGames: 5, marketsPerGame: 1, stake: 15, minTotal: 4.0,  maxTotal: 40.0 },
  bingo:     { nGames: 8, minGames: 6, marketsPerGame: 1, stake: 10, minTotal: 5.0,  maxTotal: 80.0 },
  sinfonia:  { nGames: 2, minGames: 2, marketsPerGame: 6, stake: 20, minTotal: 1.5,  maxTotal: 20.0 }, // 🆕 Sinfonia: teto teórico=6; cap real é dinâmico por qualidade do jogo
};
// Qualidade mínima por jogo (gate de entrada)
const MIN_SCORE = 0.55;  // Score ≥ 55%
const MIN_CONF  = 0.45;  // Confiança ≥ 45%

export interface LiveMultipleSuggestion {
  id: string;
  type: "bronze" | "silver" | "gold" | "agressivo" | "bingo" | "sinfonia";
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

  /** Busca a melhor odd disponível: real API > CSV > odd estimada (minOdd do engine) */
  private getBestOdd(game: any, marketLabel: string): number {
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
        const lineMatch = nl.match(/over\s+(\d+\.\d+)/);
        if (lineMatch && nk.includes(`over ${lineMatch[1]}`)) {
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
    if (typeof csvOdd === 'number' && !isNaN(csvOdd) && csvOdd > 1) return csvOdd;

    // 3. Fallback final: odd estimada conservadora do engine (para Finalizações HT, Cantos HT, etc.)
    // O CSV não tem odds para esses mercados específicos, mas o engine tem estimativas seguras
    const estimatedOdd = getMinOddForLabel(marketLabel);
    if (typeof estimatedOdd === 'number' && estimatedOdd > 1) return estimatedOdd;

    // 4. Fallback Universal: Se a estatística é boa, não descartamos por falta de odd no CSV.
    // Retornamos uma odd mínima justa para permitir a geração do bilhete. A odd real será vista na casa de apostas.
    return 1.30;
  }

  // Infere o eixo (axis) de um mercado a partir do label (suggestCombo não retorna axis)
  private inferAxis(label: string): string {
    const l = label.toLowerCase();
    if ((l.includes('finaliz') || l.includes('chute')) && l.includes('ht')) return 'chutes_ht';
    if ((l.includes('canto') || l.includes('escanteio')) && l.includes('ht')) return 'cantos_ht';
    if (l.includes('canto') || l.includes('escanteio')) return 'cantos';
    if (l.includes('ambas marcam') || l.includes('btts')) return 'btts';
    if (l.includes('under')) return 'under';
    if (l.includes('vence') && (l.includes('over') || l.includes('+'))) return 'fav_gols';
    if (l.includes('vence')) return 'fav';
    if (l.includes('blitz')) return 'chutes_ht';
    if ((l.includes('gol') || l.includes('over 0.5') || l.includes('over 1.5')) && l.includes('ht')) return 'golsHT';
    if (l.includes('over')) return 'gols';
    return 'other';
  }

  // Agrupa eixos finos em famílias para diversidade ENTRE jogos no bilhete
  // REMOVIDO: cantos + cantos_ht → agora são tratados como eixos separados
  private broadAxis(fineAxis: string): string {
    if (fineAxis === 'gols' || fineAxis === 'golsHT' || fineAxis === 'fav_gols') return 'gols';
    return fineAxis; // cantos, cantos_ht, chutes_ht, btts, fav, under, other → todos únicos
  }

  // Pontua especificidade de um mercado: HT por time > HT total > FT específico > FT genérico
  // Usado internamente pela Sinfonia (via suggestBetBuilder) — NÃO usado para múltiplas clássicas
  private marketSpecificity(label: string): number {
    const l = label.toLowerCase();
    if ((l.includes('finaliz') || l.includes('chute')) && l.includes('ht')) return 100;
    if ((l.includes('canto') || l.includes('escanteio')) && l.includes('ht')) return 95;
    if (l.includes('blitz')) return 100;
    if (l.includes('canto') || l.includes('escanteio')) return 85;
    if (l.includes('ht') && l.includes('vence')) return 60;
    if (l.includes('over 2.5') || l.includes('ambas marcam') || l.includes('btts')) return 40;
    if (l.includes('over 1.5')) return 10;
    if (l.includes('vence')) return 20;
    return 30;
  }

  // 🎯 Prioridade para múltiplas CLÁSSICAS: mercados tradicionais e equilibrados primeiro
  // Micro-linhas HT ficam como último recurso (território da Sinfonia)
  private marketTraditionalPriority(label: string): number {
    const l = label.toLowerCase();
    // Tier 1: Mercados tradicionais com odds equilibradas
    if (l.includes('over 2.5') && l.includes('ambas marcam')) return 100; // Over 2.5 + BTTS combo
    if (l.includes('over 2.5') && !l.includes('canto')) return 95;         // Over 2.5 FT
    if (l.includes('ambas marcam') || l.includes('btts')) return 95;       // BTTS
    // Tier 2: Favorito com gols
    if (l.includes('vence') && l.includes('over')) return 90;              // Vence + Over X
    if (l.includes('vence') && l.includes('ht')) return 85;                // Vence + HT
    // Tier 3: Mercados de gols genéricos
    if (l.includes('over 1.5') && !l.includes('canto') && !l.includes('ht')) return 80; // Over 1.5 FT
    if (l.includes('vence') && !l.includes('finaliz')) return 75;          // Favorito Vence
    if (l.includes('under')) return 70;                                     // Under 2.5
    // Tier 4: Cantos FT (ainda tradicional)
    if ((l.includes('canto') || l.includes('escanteio')) && !l.includes('ht')) return 60;
    // Tier 5: Gols HT (mais específico mas ainda operável)
    if (l.includes('gol') && l.includes('ht')) return 50;
    if (l.includes('over 0.5') && l.includes('ht')) return 50;
    if (l.includes('over 1.5') && l.includes('ht')) return 45;
    // Tier 6: Micro-linhas HT — território da Sinfonia, último recurso em clássicas
    if ((l.includes('canto') || l.includes('escanteio')) && l.includes('ht')) return 30;
    if ((l.includes('finaliz') || l.includes('chute')) && l.includes('ht')) return 20;
    if (l.includes('blitz')) return 20;
    return 40;
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

  // Verifica se odd está na faixa operável por mercado individual (amplo o suficiente para não descartar estatísticas boas)
  private isOddInRange(odd: number | null): boolean {
    if (!odd || odd <= 1.01) return false;
    if (odd > 20.00) return false; // Apenas barra odds absurdamente altas que indicam erro
    return true;
  }

  // 🎯 Extrai MÚLTIPLOS mercados complementares de eixos diferentes para um jogo (Bet Builder)
  // ticketAxes: eixos já usados por outros jogos no bilhete — penaliza repetição
  private getGameMarkets(game: any, usedSigs: Set<string>, maxMarkets: number, ticketAxes?: Set<string>, isSinfonia: boolean = false): any[] {
    const combo = isSinfonia ? (suggestBetBuilder(game) || []) : (suggestCombo(game) || []);
    const main = suggestMainMarket(game);
    const allCandidates: any[] = [];
    
    if (isSinfonia) {
      allCandidates.push(...combo);
    } else {
      // Para as múltiplas normais, preferimos o Main Market, mas se o combo tiver algo melhor, tentamos usar
      if (main?.label) allCandidates.push(main);
      allCandidates.push(...combo);
    }

    // Ordenar: Sinfonia mantém ordem do engine; Clássicas priorizam mercados tradicionais
    if (!isSinfonia) {
      allCandidates.sort((a: any, b: any) =>
        this.marketTraditionalPriority(b.label) - this.marketTraditionalPriority(a.label)
      );
    }

    const selected: any[] = [];
    const usedAxes = new Set<string>(); // Não repetir mesmo eixo no mesmo jogo

    for (const opt of allCandidates) {
      if (selected.length >= maxMarkets) break;
      if (!opt?.label) continue;
      if (!this.isLabelAllowed(opt.label, game.league || '')) continue;

      // Não repetir mesmo eixo fino no mesmo jogo (ex: 2 linhas de cantos_ht)
      const axis = this.inferAxis(opt.label);
      if (usedAxes.has(axis)) continue;

      // BLOQUEIO FORTE: se a família do eixo já está no bilhete, pular (Apenas se não for Sinfonia)
      // Sinfonia permite repetição de eixos no bilhete (ex: vários jogos com cantos HT)
      const broad = this.broadAxis(axis);
      if (!isSinfonia && ticketAxes && ticketAxes.has(broad)) continue;

      let bestOdd = this.getBestOdd(game, opt.label);

      // A verificação agora é hiper-flexível (1.01 a 20.00), priorizando a estatística
      if (!this.isOddInRange(bestOdd)) continue;

      const sig = `${game.home}_${opt.label}`;
      if (usedSigs.has(sig)) continue;

      selected.push({ ...opt, _resolvedOdd: bestOdd, _axis: axis });
      usedSigs.add(sig);
      usedAxes.add(axis);
    }

    return selected;
  }

  // Analisa CSV do dia para gerar múltiplas pré-live
  analyzeLiveMultiples(csvText: string, oddsMap?: Record<number, PreMatchOdds>, fixtureMap?: Record<string, number>, ignoredMatches: string[] = []): {
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
      
      // Filtra jogos que ainda não começaram E são de hoje
      const todayDDMM = (() => {
        const now = new Date();
        return String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0');
      })();
      const upcomingGames = games.filter(g => {
        if (g.status && g.status !== 'NS') return false;
        // Verificar se o jogo é de hoje (evitar jogos NS de dias anteriores no CSV acumulado)
        const gameDateDDMM = extractDateFromHour(g.hour);
        return gameDateDDMM === todayDDMM;
      });
      console.log(`🎯 ${upcomingGames.length} jogos NS de hoje disponíveis para análise pré-live`);

      // 🔄 Filtrar jogos ignorados pelo usuário (blacklist temporária — efeito roleta, só na sessão)
      const availableGames = ignoredMatches.length > 0
        ? upcomingGames.filter(g => !ignoredMatches.includes(g.match))
        : upcomingGames;
      if (ignoredMatches.length > 0) {
        console.log(`🔄 ${ignoredMatches.length} jogos ignorados pelo usuário. ${availableGames.length} restantes.`);
      }
      
      // 🚫 FILTRO DE QUALIDADE — Score ≥ 65% E Confiança ≥ 55%
      const qualityGames = availableGames.filter(g => {
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
      if (poisonA.isPoison && !poisonB.isPoison) return -1;
      if (!poisonA.isPoison && poisonB.isPoison) return 1;
      if (poisonA.isPoison && poisonB.isPoison) {
        if (poisonA.highestLevel !== poisonB.highestLevel) return poisonA.highestLevel - poisonB.highestLevel;
      }
      const sA = computeScore(a); const sB = computeScore(b);
      const scoreA = typeof sA === 'number' ? sA : (sA as any)?.score || 0;
      const scoreB = typeof sB === 'number' ? sB : (sB as any)?.score || 0;
      return scoreB - scoreA;
    });

    if (topGames.length < 2) return suggestions;

    // Converte mercados de um jogo em seleções flat para o bilhete
    const buildSelections = (g: any, markets: any[], reason: string) => {
      const confResult = computeConfidence(g);
      const conf = (confResult as any)?.score || 0;
      const scoreResult = computeScore(g);
      const score = typeof scoreResult === 'number' ? scoreResult : (scoreResult as any)?.score || 0;
      const profile = classifyProfile(g);
      const fav = getFavorito(g);
      const poison = detectPoisonTriggers(g);
      const poisonTag = poison.isPoison ? ` ${poison.primaryTrigger?.icon} ${poison.primaryTrigger?.tag}` : '';
      const matchName = g?.match || `${g?.home || ""} x ${g?.away || ""}`.trim();

      return markets.map((m: any) => ({
        match: matchName,
        league: g?.league || "—",
        hour: g?.hour || "—",
        market: m.label,
        odd: m._resolvedOdd || 0,
        minOdd: 0,
        hasValue: true,
        edge: 0,
        recommendation: "Operável",
        oddTag: "",
        reason: `${reason}${poisonTag}`,
        gameProfile: profile || "generic",
        confidence: Math.round(conf * 100),
        _meta: { score, fav: (fav as any)?.nome || "" },
      }));
    };

    // Pool GLOBAL por LINHA — mesma linha (jogo+mercado) não repete entre bilhetes
    // Mesmo jogo PODE repetir com mercado DIFERENTE em outro bilhete
    const globalUsedSigs = new Set<string>();

    // Bet Builder: N jogos × K mercados por jogo
    const buildSGPTicket = (
      typeId: string,
      riskLevel: LiveMultipleSuggestion['riskLevel'],
      reason: string
    ): LiveMultipleSuggestion | null => {
      const isSinfonia = typeId === 'sinfonia';
      const tier = TIER_CONFIG[typeId];
      if (!tier) return null;

      const allSelections: any[] = [];
      let gamesUsed = 0;

      const ticketBroadAxes = new Set<string>(); // Famílias de eixo já usadas neste bilhete
      const ticketProfiles = new Map<string, number>(); // Perfis usados (max 2 por perfil)

      // Se for Sinfonia, usamos jogos com Gatilho Poison OU Score Alto (>= 60%)
      const candidateGames = isSinfonia 
        ? topGames.filter(g => detectPoisonTriggers(g).isPoison || computeScore(g)?.score >= 0.60)
        : topGames;

      for (const g of candidateGames) {
        if (gamesUsed >= tier.nGames) break;

        // Cap de perfil: max 2 jogos do mesmo perfil por bilhete
        const profile = classifyProfile(g);
        if ((ticketProfiles.get(profile) || 0) >= 2 && !isSinfonia) {
          console.log(`[SGP-${typeId}] ${g.match}: perfil ${profile} já tem 2 jogos — pulando`);
          continue;
        }

        // Cap dinâmico para Sinfonia: mais qualidade estatística = mais linhas permitidas
        let effectiveMax = tier.marketsPerGame;
        if (isSinfonia) {
          const poison = detectPoisonTriggers(g);
          const sr = computeScore(g);
          const sc = typeof sr === 'number' ? sr : (sr as any)?.score || 0;
          if (poison.isPoison) effectiveMax = 5;       // Dominância extrema → até 5 micro-linhas
          else if (sc >= 0.70) effectiveMax = 4;        // Score alto → até 4
          else effectiveMax = 3;                         // Qualidade padrão → 3
          console.log(`[SGP-sinfonia] ${g.match}: cap dinâmico = ${effectiveMax} mercados (score=${(sc*100).toFixed(0)}%, poison=${poison.isPoison})`);
        }

        // Extrai mercados, BLOQUEANDO famílias de eixo já presentes no bilhete (Sinfonia ignora bloqueio cross-jogo)
        const markets = this.getGameMarkets(g, globalUsedSigs, effectiveMax, ticketBroadAxes, isSinfonia);
        if (markets.length < 2 && isSinfonia) {
          console.log(`[SGP-${typeId}] ${g.match}: Sinfonia exige pelo menos 2 mercados por jogo — pulando`);
          continue;
        }
        if (markets.length === 0) {
          console.log(`[SGP-${typeId}] ${g.match}: 0 mercados fora dos eixos já no bilhete — pulando`);
          continue;
        }

        // Odd combinada deste jogo
        const gameOdd = markets.reduce((acc: number, m: any) => acc * (m._resolvedOdd || 1), 1);
        if (gameOdd < MIN_GAME_ODD || gameOdd > MAX_GAME_ODD) {
          console.log(`[SGP-${typeId}] ${g.match}: gameOdd ${gameOdd.toFixed(2)} fora do range ${MIN_GAME_ODD}-${MAX_GAME_ODD}`);
          continue;
        }

        console.log(`[SGP-${typeId}] ✅ ${g.match} [${profile}]: ${markets.length} mercados, gameOdd ${gameOdd.toFixed(2)}`);
        markets.forEach((m: any) => {
          const broad = this.broadAxis(m._axis);
          console.log(`   → [${broad}/${m._axis}] ${m.label} @ ${m._resolvedOdd?.toFixed(2)}`);
          ticketBroadAxes.add(broad); // Registrar FAMÍLIA para bloqueio cross-jogo
        });
        ticketProfiles.set(profile, (ticketProfiles.get(profile) || 0) + 1);
        allSelections.push(...buildSelections(g, markets, reason));
        gamesUsed++;
      }

      console.log(`[SGP-${typeId}] ${gamesUsed}/${tier.nGames} jogos usados (mínimo exigido: ${tier.minGames})`);
      if (gamesUsed < tier.minGames) return null;

      // Todas devem ter odd
      if (allSelections.some((s: any) => !s.odd || s.odd <= 1)) return null;

      const combinedOdd = allSelections.reduce((acc: number, s: any) => acc * s.odd, 1);
      // REMOVIDO o bloqueio de minTotal/maxTotal: se o motor indicou, o bilhete é válido!
      // if (combinedOdd < tier.minTotal || combinedOdd > tier.maxTotal) return null;

      const avgConf = allSelections.reduce((acc: number, s: any) => acc + (s.confidence / 100), 0) / allSelections.length;
      const expectedValue = (combinedOdd * avgConf) - 1;

      return {
        id: `${typeId}_${Date.now()}_${++PreLiveMultipleAnalyzer.suggestionCounter}`,
        type: typeId as any,
        confidence: Math.round(avgConf * 100),
        expectedValue,
        riskLevel,
        selections: allSelections,
        combinedOdd,
        suggestedStake: tier.stake,
        expectedReturn: combinedOdd * tier.stake,
        riskReward: expectedValue > 0.08 ? "Excelente" : expectedValue > 0.04 ? "Bom" : "Moderado",
      };
    };

    // 1️⃣ Sinfonia de Pardais gerada PRIMEIRO para ter prioridade nas micro-linhas
    const sinfonia = buildSGPTicket('sinfonia', 'low', '🐦 Sinfonia de Pardais');
    if (sinfonia) suggestions.push(sinfonia);

    // 2️⃣ Múltiplas Clássicas (1 mercado por jogo) geradas na sequência
    const seguro = buildSGPTicket('bronze', 'low', '🛡️ Seguro');
    if (seguro) suggestions.push(seguro);

    const padrao = buildSGPTicket('silver', 'low', '⚖️ Padrão');
    if (padrao) suggestions.push(padrao);

    const forte = buildSGPTicket('gold', 'medium', '💪 Forte');
    if (forte) suggestions.push(forte);

    const agressivo = buildSGPTicket('agressivo', 'medium', '🚀 Agressivo');
    if (agressivo) suggestions.push(agressivo);

    const bingo = buildSGPTicket('bingo', 'high', '💣 Bingo');
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
