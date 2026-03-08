// 🔄 CONEXÃO POISSON COM SISTEMA DE RESULTADOS

import { saveABTestMetrics, updateABTestResult, getABTestMetrics } from './ab-test-persistence';

// Hook para conectar métricas Poisson com sistema de resultados
export function connectPoissonWithResults() {
  // Sobrescrever toLiveMultipleSuggestionDTO para incluir persistência
  const originalToDTO = window.toLiveMultipleSuggestionDTO;
  
  window.toLiveMultipleSuggestionDTO = function(suggestion: any) {
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
        confidence: m.confidence,
        scoreBase: m.scoreBase,
        scoreFinal: m.scoreFinal,
        poissonFairProb: m.poissonFairProb,
        poissonModelEdge: m.poissonModelEdge,
        selected: m.selected,
        result: null, // Será atualizado pós-jogo
        profit: null,  // Será atualizado pós-jogo
        roi: null,     // Será atualizado pós-jogo
        match: m.match || '',
        league: m.league || '',
        odd: m.odd || 0,
        combinedOdd: suggestion.combinedOdd || 0
      }));
      
      saveABTestMetrics(persistentMetrics);
      console.log(`[POISSON-RESULTS] 💾 Salvas ${persistentMetrics.length} métricas para sugestão ${suggestion.id}`);
    }
    
    // Chamar função original
    return originalToDTO(suggestion);
  };
  
  // Hook para atualizar resultados quando jogos finalizam
  const originalUpdateResults = window.updateGameResults || function() {};
  
  window.updateGameResults = function(games: any[]) {
    // Chamar função original primeiro
    originalUpdateResults(games);
    
    // Atualizar métricas Poisson baseado nos resultados
    games.forEach(game => {
      // Buscar sugestões que contêm este jogo
      const metrics = getABTestMetrics().filter(m => 
        m.match === game.match && m.result === null
      );
      
      metrics.forEach(metric => {
        // Verificar se o mercado foi acertado
        const selection = game.combo?.find((c: any) => 
          c.label === metric.market && c.result !== 'no-odd' && c.result !== 'avg'
        );
        
        if (selection) {
          const result = selection.result as any;
          const profit = selection.profit || 0;
          
          // Atualizar métrica
          updateABTestResult(metric.id, result, profit);
          
          console.log(`[POISSON-RESULTS] 📊 Atualizado ${metric.match} ${metric.market}: ${result} (R$${profit.toFixed(2)})`);
        }
      });
    });
  };
  
  console.log('[POISSON-RESULTS] 🔄 Conectado com sistema de resultados');
}

// Função para gerar relatório de performance Poisson
export function generatePoissonPerformanceReport(): string {
  const { generateABTestReport } = require('./ab-test-persistence');
  
  const report = generateABTestReport();
  
  // Adicionar análise de mercado
  const metrics = getABTestMetrics();
  const byMarket = metrics.reduce((acc, m) => {
    if (!acc[m.market]) {
      acc[m.market] = { total: 0, wins: 0, profit: 0, avgEdge: 0 };
    }
    acc[m.market].total++;
    if (m.result === 'win') acc[m.market].wins++;
    if (m.profit !== null) acc[m.market].profit += m.profit;
    acc[m.market].avgEdge += m.edge;
    return acc;
  }, {} as any);
  
  // Calcular médias
  Object.keys(byMarket).forEach(market => {
    const data = byMarket[market];
    data.hitRate = data.total > 0 ? (data.wins / data.total) * 100 : 0;
    data.roi = data.profit > 0 ? (data.profit / (25 * data.total)) * 100 : 0;
    data.avgEdge = data.avgEdge / data.total;
  });
  
  report += '\n📈 PERFORMANCE POR MERCADO:\n';
  Object.entries(byMarket)
    .sort(([,a], [,b]) => b.avgEdge - a.avgEdge)
    .forEach(([market, data]) => {
      report += `${market}: ${data.hitRate.toFixed(1)}% HR | R$${data.profit.toFixed(2)} | ${data.avgEdge.toFixed(1)}% edge\n`;
    });
  
  return report;
}

// Inicializar conexão quando o módulo for carregado
if (typeof window !== 'undefined') {
  connectPoissonWithResults();
}
