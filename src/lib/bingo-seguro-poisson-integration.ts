// 🧪 INTEGRAÇÃO POISSON NO BUILDBINGOSEGURO
// Implementação plugável para teste A/B

import { createPoissonCapsule, PoissonMode, PoissonCapsuleResult } from './poisson-capsule';
import { computeScore, calculateValueBet, computeConfidence, classifyProfile } from '../engine';
import { toLiveMultipleSuggestionDTO } from './domain/types';

// 🎯 FUNÇÃO AUXILIAR PARA INTEGRAR POISSON NO SCORE COMPOSTO
export function integratePoissonInBuildBingoSeguro(
  originalBuildBingoSeguro: Function,
  poissonMode: PoissonMode = 'off'
) {
  return async function enhancedBuildBingoSeguro(games: any[]): Promise<any> {
    console.log(`[BINGO-SEGURO] Construindo bilhete seguro com edge real e diversificação...`);
    console.log(`[BINGO-SEGURO] 🧪 Cápsula Poisson: ${poissonMode.toUpperCase()}`);
    
    // Criar instância da cápsula Poisson
    const poissonCapsule = createPoissonCapsule(poissonMode);
    const poissonMetrics = poissonCapsule.getMetrics();
    console.log(`[BINGO-SEGURO] 📊 Poisson: ${poissonMetrics.enabledMarkets.length} mercados, peso médio=${poissonMetrics.avgWeightFactor.toFixed(2)}`);

    // Função robusta para identificar família de mercado
    const getMarketFamily = (market: string): string => {
      if (market.includes("Ambas Marcam")) return "btts";
      if (market.includes("escanteios FT")) return "corners_ft";
      if (market.includes("gols 1T")) return "goals_ht";
      if (market.includes("gols FT") && market.includes("Mais de")) return "goals_ft";
      return "other";
    };

    // Prioridade de mercado para score composto
    const getMarketPriority = (market: string): number => {
      if (market.includes("Ambas Marcam — Sim")) return 8;
      if (market.includes("Mais de 2.5 gols FT")) return 7;
      if (market.includes("Mais de 1.5 gols FT")) return 6;
      if (market.includes("Mais de 0.5 gols 1T")) return 5;
      if (market.includes("Mais de 8.5 escanteios FT")) return 4;
      if (market.includes("Mais de 9.5 escanteios FT")) return 3;
      if (market.includes("Mais de 10.5 escanteios FT")) return 2;
      return 1;
    };
    
    // Mercados permitidos para o Bingo Seguro
    const allowedMarkets = [
      "Ambas Marcam — Sim",
      "Mais de 2.5 gols FT",
      "Mais de 1.5 gols FT", 
      "Mais de 8.5 escanteios FT",
      "Mais de 9.5 escanteios FT",
      "Mais de 10.5 escanteios FT",
      "Mais de 0.5 gols 1T"
    ];

    // Top 3-4 jogos por score
    const topGames = games
      .sort((a, b) => {
        const scoreA = typeof computeScore(a) === 'number' ? computeScore(a) : (computeScore(a) as any)?.score || 0;
        const scoreB = typeof computeScore(b) === 'number' ? computeScore(b) : (computeScore(b) as any)?.score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 4);

    console.log(`[BINGO-SEGURO] ${topGames.length} jogos candidatos`);

    const selections: any[] = [];
    const usedGames = new Set<string>();
    const familyCount = new Map<string, number>();
    const SOFT_LIMIT_FAMILY = 2;
    const HARD_LIMIT_FAMILY = 3;
    const REPETITION_PENALTY = 2;
    const DIVERSITY_BONUS = 3;

    // 🧪 MÉTRICAS PARA TESTE A/B
    const abTestMetrics: any[] = [];

    for (const g of topGames) {
      if (selections.length >= 4) break;
      if (usedGames.has(g.match)) continue;

      let bestMarket: any = null;
      let bestScore = -Infinity;
      let bestEdge = 0;
      let bestSelection: any = null;
      const candidates: Array<{
        market: string; 
        edge: number; 
        score: number; 
        selection: any;
        poissonResult: PoissonCapsuleResult;
      }> = [];

      // Coletar todos os candidatos válidos com análise Poisson
      for (const market of allowedMarkets) {
        // TODO: Implementar resolveOdd adequado
        const resolution = { 
          resolvedOdd: 1.5,
          marketOdd: 1.5,
          minOdd: 1.4,
          source: 'estimated' // string em vez de literal
        }; // placeholder
        if (resolution.marketOdd && resolution.marketOdd >= 1.80) {
          if (resolution.marketOdd < 1.35 || resolution.marketOdd > 4.00) {
            console.log(`[BINGO-SEGURO] Seleção descartada — odd fora do range operável: ${resolution.marketOdd}`);
            continue;
          }
          
          const valueResult = calculateValueBet(g, market, resolution);
          const edge = valueResult?.edge ?? 0;
          
          if (edge <= 0) continue;

          const family = getMarketFamily(market);
          const familyUsage = familyCount.get(family) || 0;
          
          // 🧪 ANÁLISE POISSON
          const poissonResult = poissonCapsule.analyze(g, market, resolution.marketOdd);
          
          // Verificar veto Poisson em modo strict
          if (poissonResult.veto) {
            console.log(`[BINGO-SEGURO] 🚫 VETO Poisson: ${g.match} ${market} - ${poissonResult.reason}`);
            continue;
          }
          
          // Calcular score composto com Poisson
          const confidence = (computeConfidence(g)?.score || 0) * 100;
          const priority = getMarketPriority(market);
          
          let finalScore = edge + (confidence / 10) + priority;
          
          // Ajuste de diversificação
          let diversityAdjustment = 0;
          if (familyUsage === 0) {
            diversityAdjustment += DIVERSITY_BONUS;
          }
          if (familyUsage >= SOFT_LIMIT_FAMILY) {
            const excessCount = familyUsage - SOFT_LIMIT_FAMILY + 1;
            const penalty = REPETITION_PENALTY * excessCount;
            diversityAdjustment -= penalty;
          }
          
          // 🧪 APLICAR BOOST POISSON
          let poissonBoost = 0;
          if (poissonResult.enabled && !poissonResult.veto) {
            poissonBoost = poissonResult.confidenceBoost;
            finalScore += poissonBoost;
          }
          
          finalScore += diversityAdjustment;
          
          // 🧪 LOG COMPLETO COM POISSON
          console.log(`[BINGO-SEGURO] ${g.match}: ${market} | família=${family} | edge=${edge}% | conf=${confidence.toFixed(1)} | prio=${priority} | ajuste=${diversityAdjustment > 0 ? '+' : ''}${diversityAdjustment} | fairProb=${(poissonResult.fairProb * 100).toFixed(1)}% | implied=${(poissonResult.impliedProb * 100).toFixed(1)}% | modelEdge=${poissonResult.modelEdge.toFixed(1)}% | poissonBoost=${poissonBoost > 0 ? '+' : ''}${poissonBoost.toFixed(1)} | score=${finalScore.toFixed(1)} | ${poissonResult.reason}`);

          const selection = {
            match: g.match,
            league: g.league || "—",
            hour: g.hour || "—",
            market,
            odd: resolution.marketOdd,
            minOdd: resolution.minOdd,
            hasValue: valueResult?.hasValue || false,
            edge,
            recommendation: valueResult?.recommendation || "Sem valor",
            reason: `Edge ${edge}% · ${valueResult?.recommendation || "Sem valor"} · ${poissonResult.reason}`,
            gameProfile: classifyProfile(g) || "generic",
            confidence: Math.round((computeConfidence(g)?.score || 0) * 100),
            oddTag: resolution.source === 'api-real' ? "🟢 API" : resolution.source === 'csv' ? "📊 CSV" : resolution.source === 'estimated' ? "~Estimada" : "?Desconhecida",
            // 🧪 METADADOS POISSON
            poissonData: {
              enabled: poissonResult.enabled,
              fairProb: poissonResult.fairProb,
              impliedProb: poissonResult.impliedProb,
              modelEdge: poissonResult.modelEdge,
              boost: poissonBoost,
              veto: poissonResult.veto,
              mode: poissonMode
            }
          };
          
          // 🧪 SALVAR MÉTRICAS PARA TESTE A/B
          abTestMetrics.push({
            strategyVersion: 'bingoSeguro',
            poissonMode,
            market,
            family,
            edge,
            confidence: confidence / 100,
            scoreBase: edge + (confidence / 10) + priority + diversityAdjustment - poissonBoost,
            scoreFinal: finalScore,
            poissonFairProb: poissonResult.fairProb,
            poissonModelEdge: poissonResult.modelEdge,
            selected: false, // será atualizado após seleção
            result: null,
            profit: null,
            roi: null
          });
          
          candidates.push({ market, edge, score: finalScore, selection, poissonResult });
        }
      }

      // Escolher o melhor candidato com score composto e diversificação inteligente
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        
        const chosen = candidates[0];
        let family = getMarketFamily(chosen.market);
        const familyUsage = familyCount.get(family) || 0;
        
        // Verificar hard limit da família
        if (familyUsage >= HARD_LIMIT_FAMILY) {
          const alternatives = candidates.filter(c => getMarketFamily(c.market) !== family);
          if (alternatives.length > 0) {
            const altFamily = getMarketFamily(alternatives[0].market);
            bestMarket = alternatives[0].market;
            bestScore = alternatives[0].score;
            bestEdge = alternatives[0].edge;
            bestSelection = alternatives[0].selection;
            console.log(`[BINGO-SEGURO] 🚫 Hard limit: família ${family} (${familyUsage}/${HARD_LIMIT_FAMILY}) - alternativa escolhida (${alternatives[0].market})`);
            family = altFamily;
          } else {
            bestMarket = chosen.market;
            bestScore = chosen.score;
            bestEdge = chosen.edge;
            bestSelection = chosen.selection;
            console.log(`[BINGO-SEGURO] 🚨 Fallback: família ${family} no hard limit (${HARD_LIMIT_FAMILY}) e sem alternativa - usando melhor disponível (${chosen.market})`);
          }
        } else {
          bestMarket = chosen.market;
          bestScore = chosen.score;
          bestEdge = chosen.edge;
          bestSelection = chosen.selection;
        }

        familyCount.set(family, (familyCount.get(family) || 0) + 1);
        
        console.log(`[BINGO-SEGURO] ✅ ${g.match}: ${bestMarket} @ ${bestSelection.odd} (edge=${bestEdge}%, score=${bestScore.toFixed(1)}, família=${family})`);
        
        // 🧪 MARCAR COMO SELECIONADO NAS MÉTRICAS
        const selectedMetric = abTestMetrics.find(m => 
          m.market === bestMarket && m.match === g.match
        );
        if (selectedMetric) {
          selectedMetric.selected = true;
        }
        
        selections.push(bestSelection);
        usedGames.add(g.match);
      } else {
        console.log(`[BINGO-SEGURO] ❌ ${g.match}: nenhum mercado com edge positivo encontrado`);
      }
    }

    // 🧪 LOG FINAL COM MÉTRICAS A/B
    console.log(`[BINGO-SEGURO] 📊 MÉTRICAS A/B: ${abTestMetrics.length} candidatos analisados`);
    console.log(`[BINGO-SEGURO] 📊 Selecionados: ${abTestMetrics.filter(m => m.selected).length}/${abTestMetrics.length}`);
    console.log(`[BINGO-SEGURO] 📊 Poisson enabled: ${abTestMetrics.filter(m => m.poissonFairProb > 0).length} mercados`);
    
    // Calcular odd total e métricas
    const combinedOdd = selections.reduce((acc, s) => acc * s.odd, 1);
    const suggestedStake = 30;
    const expectedReturn = combinedOdd * suggestedStake;
    const avgEdge = selections.reduce((acc, s) => acc + s.edge / 100, 0) / selections.length;

    const domainSuggestion = {
      id: `bingo-seguro-${Date.now()}`,
      strategy: "bingoSeguro" as any, // TODO: usar StrategyType correto
      suggestionConfidence: selections.reduce((acc, s) => acc + s.confidence, 0) / selections.length,
      expectedValue: avgEdge,
      riskLevel: "low" as any, // TODO: usar RiskLevel correto
      selections,
      combinedOdd: parseFloat(combinedOdd.toFixed(2)),
      suggestedStake,
      expectedReturn: parseFloat(expectedReturn.toFixed(2)),
      // 🧪 INCLUIR MÉTRICAS A/B
      abTestMetrics,
      poissonMode,
      poissonMetrics
    };

    return toLiveMultipleSuggestionDTO(domainSuggestion);
  };
}

// 🎯 PSEUDOCÓDIGO DA INTEGRAÇÃO

/*
1. CRIAR CÁPSULA POISSON
   const poissonCapsule = createPoissonCapsule(mode)

2. ANALISAR CADA CANDIDATO
   const poissonResult = poissonCapsule.analyze(game, market, odd)

3. VERIFICAR VETO (modo strict)
   if (poissonResult.veto) continue

4. APLICAR BOOST NO SCORE
   finalScore += poissonResult.confidenceBoost

5. LOG COMPLETO
   console.log(`edge | conf | prio | diversidade | poissonBoost | scoreFinal`)

6. SALVAR MÉTRICAS A/B
   abTestMetrics.push({
     strategyVersion, poissonMode, market, family,
     edge, confidence, scoreBase, scoreFinal,
     poissonFairProb, poissonModelEdge, selected
   })

7. RETORNAR SUGGESTÃO COM METADADOS
   return toLiveMultipleSuggestionDTO({
     ...domainSuggestion,
     abTestMetrics, poissonMode, poissonMetrics
   })
*/
