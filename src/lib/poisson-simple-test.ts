// 🧪 TESTE POISSON SIMPLES - VERSÃO DEBUG

import { PoissonMode } from './poisson-capsule';

// Função simples para testar Poisson sem depender do analyzer
export function testPoissonSimple() {
  console.log('🧪 [SIMPLE-TEST] Iniciando teste Poisson simples...');
  
  // Criar mock games
  const mockGames = [
    {
      match: "Flamengo x Vasco",
      league: "Brasileirão",
      avgGoalsHome: 1.8,
      avgGoalsAway: 1.2
    },
    {
      match: "Palmeiras x Corinthians", 
      league: "Brasileirão",
      avgGoalsHome: 1.5,
      avgGoalsAway: 1.1
    }
  ];
  
  // Criar mock analyzer
  const mockAnalyzer = {
    buildBingoSeguro: async (games: any[]) => {
      console.log(`📊 [MOCK] Recebidos ${games.length} jogos para análise`);
      
      // Simular resultado do buildBingoSeguro
      const mockResult = {
        id: `mock-${Date.now()}`,
        selections: [
          {
            match: "Flamengo x Vasco",
            league: "Brasileirão",
            market: "Ambas Marcam — Sim",
            odd: 2.25,
            edge: 15.5,
            confidence: 78
          },
          {
            match: "Palmeiras x Corinthians",
            league: "Brasileirão", 
            market: "Mais de 2.5 gols FT",
            odd: 1.95,
            edge: 12.3,
            confidence: 65
          }
        ],
        combinedOdd: 4.39,
        expectedValue: 0.139
      };
      
      console.log(`✅ [MOCK] Retornado ${mockResult.selections.length} seleções`);
      return mockResult;
    }
  };
  
  // Testar com diferentes modos
  const testModes = ['off', 'assist', 'tie_breaker', 'strict'];
  
  return testModes.reduce(async (acc, mode) => {
    const results = await acc;
    console.log(`\n🧪 [SIMPLE-TEST] Testando modo: ${mode.toUpperCase()}`);
    
    try {
      // Teste simples sem Poisson integration
      const result = await mockAnalyzer.buildBingoSeguro(mockGames);
      
      results[mode] = result;
      console.log(`✅ [SIMPLE-TEST] ${mode}: ${result.selections.length} seleções`);
      
    } catch (error) {
      console.error(`❌ [SIMPLE-TEST] Erro no modo ${mode}:`, error);
      results[mode] = null;
    }
    
    return results;
  }, Promise.resolve({} as any));
}

// Teste direto da cápsula Poisson
export function testPoissonCapsuleOnly() {
  console.log('🧪 [CAPSULE-TEST] Testando apenas a cápsula Poisson...');
  
  try {
    const { createPoissonCapsule } = require('./poisson-capsule');
    
    const modes = ['off', 'assist', 'tie_breaker', 'strict'];
    
    modes.forEach(mode => {
      console.log(`\n🧪 [CAPSULE-TEST] Modo: ${mode.toUpperCase()}`);
      
      const capsule = createPoissonCapsule(mode as PoissonMode);
      const metrics = capsule.getMetrics();
      
      console.log(`📊 Mercados enabled: ${metrics.enabledMarkets.length}`);
      console.log(`📊 Peso médio: ${metrics.avgWeightFactor.toFixed(2)}`);
      
      // Testar análise de um mercado
      const mockGame = {
        match: "Flamengo x Vasco",
        league: "Brasileirão",
        avgGoalsHome: 1.8,
        avgGoalsAway: 1.2
      };
      
      const result = capsule.analyze(mockGame, "Ambas Marcam — Sim", 2.25);
      
      console.log(`🎯 Análise: enabled=${result.enabled}`);
      console.log(`🎯 Fair prob: ${(result.fairProb * 100).toFixed(1)}%`);
      console.log(`🎯 Model edge: ${result.modelEdge.toFixed(1)}%`);
      console.log(`🎯 Boost: ${result.confidenceBoost.toFixed(1)} pts`);
      console.log(`🎯 Veto: ${result.veto}`);
      console.log(`🎯 Reason: ${result.reason}`);
    });
    
  } catch (error) {
    console.error('❌ [CAPSULE-TEST] Erro:', error);
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  (window as any).testPoissonSimple = testPoissonSimple;
  (window as any).testPoissonCapsuleOnly = testPoissonCapsuleOnly;
  
  console.log(`🧪 [SIMPLE-TEST] Funções disponíveis:`);
  console.log(`   - testPoissonSimple() - Teste completo com mocks`);
  console.log(`   - testPoissonCapsuleOnly() - Teste apenas da cápsula`);
}
