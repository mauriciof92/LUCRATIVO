// 🔄 CONEXÃO POISSON COM SISTEMA DE RESULTADOS

import { saveABTestMetrics, updateABTestResult, getABTestMetrics } from './ab-test-persistence';

// Hook para conectar métricas Poisson com sistema de resultados
export function connectPoissonWithResults() {
  // Sobrescrever toLiveMultipleSuggestionDTO para incluir persistência
  const originalToDTO = (window as any).toLiveMultipleSuggestionDTO;
  
  if (originalToDTO) {
    (window as any).toLiveMultipleSuggestionDTO = function(suggestion: any) {
      // Salvar métricas A/B se existirem
      if (suggestion.abTestMetrics && Array.isArray(suggestion.abTestMetrics)) {
        const persistentMetrics = suggestion.abTestMetrics.map((m: any) => ({
          id: `ab-${suggestion.id}-${m.market}`,
          timestamp: Date.now(),
          strategyVersion: m.strategyVersion || 'bingoSeguro',
          poissonMode: m.poissonMode || 'off',
          market: m.market,
          family: m.family,
          edge: m.edge,
          fairProb: m.fairProb,
          impliedProb: m.impliedProb,
          modelEdge: m.modelEdge,
          boost: m.boost,
          veto: m.veto,
          result: null, // Será atualizado pós-jogo
          profit: null,  // Será atualizado pós-jogo
          roi: null,     // Será atualizado pós-jogo
          match: m.match || '',
          league: m.league || '',
          odd: m.odd || 0,
          combinedOdd: suggestion.combinedOdd || 0
        }));
        
        saveABTestMetrics(persistentMetrics);
        console.log(`[POISSON-RESULTS] Salvas ${persistentMetrics.length} métricas para sugestão ${suggestion.id}`);
      }
      
      // Chamar função original
      return originalToDTO(suggestion);
    };
  } else {
    console.warn('toLiveMultipleSuggestionDTO não encontrado no window');
  }
}

// Função para analisar performance das métricas Poisson
export function analyzePoissonPerformance() {
  const metrics = getABTestMetrics();
  
  if (metrics.length === 0) {
    return {
      totalBets: 0,
      totalProfit: 0,
      roi: 0,
      hitRate: 0,
      byMode: {} as Record<string, any>
    };
  }
  
  const completedBets = metrics.filter(m => m.result !== null);
  const totalProfit = completedBets.reduce((sum, m) => sum + (m.profit || 0), 0);
  const totalStake = completedBets.length * 30; // stake fixo de 30
  const wins = completedBets.filter(m => m.result === 'win').length;
  
  return {
    totalBets: completedBets.length,
    totalProfit,
    roi: totalStake > 0 ? (totalProfit / totalStake) * 100 : 0,
    hitRate: completedBets.length > 0 ? (wins / completedBets.length) * 100 : 0,
    byMode: metrics.reduce((acc, m) => {
      if (!acc[m.poissonMode]) {
        acc[m.poissonMode] = { count: 0, profit: 0, wins: 0 };
      }
      acc[m.poissonMode].count++;
      if (m.profit !== null) acc[m.poissonMode].profit += m.profit;
      if (m.result === 'win') acc[m.poissonMode].wins++;
      return acc;
    }, {} as Record<string, any>)
  };
}

// Inicializar conexão quando o módulo for carregado
if (typeof window !== 'undefined') {
  connectPoissonWithResults();
}
