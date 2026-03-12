// src/lib/trigger-engine.test.ts

import { evaluateAllMarkets, TRIGGER_CONFIGS } from './trigger-engine';
import { gameToMatchInput } from './trigger-adapter';

// Dados de teste simulando um jogo real do CSV
const mockGame = {
  home: 'Flamengo',
  away: 'Vasco',
  match: 'Flamengo x Vasco',
  league: 'Serie A',
  hour: '12/02 15:00',
  status: 'NS',
  
  // Dados CSV
  exG: 2.85,
  af: '65|48',
  gol05HT: '72|58',
  btsPercent: '68',
  favoritismo: 78.5,
  
  // Dados adicionais para cálculo
  chHTFav: 5.2,
  cantHT: 6.8,
  
  // Odds (simulando API real)
  odds: {
    over05HT: 1.85,
    over15FT: 1.65,
    over25FT: 2.10,
    bttsYes: 1.95,
  },
  
  // Flag para indicar odds reais
  hasRealOdds: true,
};

// Dados de teste com CSV apenas (sem odds reais)
const mockGameCsvOnly = {
  ...mockGame,
  odds: undefined,
  hasRealOdds: false,
};

// Função para executar testes
function runTriggerEngineTests() {
  console.log('🧪 Iniciando testes do Trigger Engine Poisson...\n');

  // Teste 1: Jogo com odds reais (csv_plus_api)
  console.log('📊 Teste 1: Jogo com odds reais (csv_plus_api)');
  const matchInput1 = gameToMatchInput(mockGame);
  console.log('MatchInput:', JSON.stringify(matchInput1, null, 2));
  
  const evaluations1 = evaluateAllMarkets(matchInput1);
  console.log('\nAvaliações:');
  evaluations1.forEach(evaluation => {
    console.log(`${evaluation.marketId}: ${evaluation.status} | Prob: ${(evaluation.modelProb ?? 0 * 100).toFixed(1)}% | Edge: ${evaluation.edgePct ? '+' + evaluation.edgePct.toFixed(1) + '%' : 'N/A'} | Confidence: ${evaluation.confidenceScore}%`);
    console.log(`  Reasons: ${evaluation.reasons.join(', ')}`);
    console.log(`  Debug:`, evaluation.debug);
  });

  // Teste 2: Jogo CSV apenas (csv_only)
  console.log('\n📊 Teste 2: Jogo CSV apenas (csv_only)');
  const matchInput2 = gameToMatchInput(mockGameCsvOnly);
  console.log('MatchInput:', JSON.stringify(matchInput2, null, 2));
  
  const evaluations2 = evaluateAllMarkets(matchInput2);
  console.log('\nAvaliações:');
  evaluations2.forEach(evaluation => {
    console.log(`${evaluation.marketId}: ${evaluation.status} | Prob: ${(evaluation.modelProb ?? 0 * 100).toFixed(1)}% | Edge: ${evaluation.edgePct ? '+' + evaluation.edgePct.toFixed(1) + '%' : 'N/A'} | Confidence: ${evaluation.confidenceScore}%`);
    console.log(`  Reasons: ${evaluation.reasons.join(', ')}`);
    console.log(`  Debug:`, evaluation.debug);
  });

  // Teste 3: Comparação de configs
  console.log('\n📊 Teste 3: Configurações dos mercados');
  Object.entries(TRIGGER_CONFIGS).forEach(([marketId, config]) => {
    console.log(`${marketId}:`);
    console.log(`  Enabled: ${config.enabled}`);
    console.log(`  Min Edge: ${config.minEdgePct}%`);
    console.log(`  Min Prob: ${(config.minModelProb * 100).toFixed(1)}%`);
    console.log(`  Min Coverage: ${(config.minCoverage * 100).toFixed(1)}%`);
    console.log(`  CSV Penalty: ${config.csvOnlyPenaltyPct}%`);
  });

  // Teste 4: Performance
  console.log('\n📊 Teste 4: Performance (1000 avaliações)');
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluateAllMarkets(matchInput1);
  }
  const end = performance.now();
  const avgTime = (end - start) / 1000;
  console.log(`Tempo médio por avaliação: ${avgTime.toFixed(2)}ms`);
  console.log(`Total para 1000 avaliações: ${(end - start).toFixed(2)}ms`);

  // Teste 5: Edge cases
  console.log('\n📊 Teste 5: Edge cases');
  
  // Jogo sem dados críticos
  const emptyGame = {
    home: 'Team A',
    away: 'Team B',
    match: 'Team A x Team B',
    league: 'Unknown',
    hour: '12/02 15:00',
    status: 'NS',
  };
  
  const matchInputEmpty = gameToMatchInput(emptyGame);
  const evaluationsEmpty = evaluateAllMarkets(matchInputEmpty);
  console.log('Jogo vazio - Avaliações:');
  evaluationsEmpty.forEach(evaluation => {
    console.log(`${evaluation.marketId}: ${evaluation.status} | Reasons: ${evaluation.reasons.join(', ')}`);
  });

  console.log('\n✅ Testes concluídos!');
}

// Executar testes se este arquivo for rodado diretamente
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  // Node.js environment
  try {
    runTriggerEngineTests();
  } catch (error) {
    console.error('❌ Erro nos testes:', error);
    process.exit(1);
  }
}

export { runTriggerEngineTests };
