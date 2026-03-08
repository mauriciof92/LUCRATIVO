// 🧪 TESTE POISSON - IMPLEMENTAÇÃO SEGURA
// Arquivo separado para não corromper o analyzer principal

import { createPoissonCapsule, PoissonMode } from './poisson-capsule';

// Função wrapper segura para testar Poisson
export function testPoissonIntegration(analyzer: any, games: any[], mode: PoissonMode = 'assist') {
  console.log(`🧪 Iniciando teste Poisson - Modo: ${mode.toUpperCase()}`);
  
  // Criar cápsula Poisson
  const poissonCapsule = createPoissonCapsule(mode);
  const metrics = poissonCapsule.getMetrics();
  console.log(`📊 Cápsula Poisson: ${metrics.enabledMarkets.length} mercados, peso médio=${metrics.avgWeightFactor.toFixed(2)}`);
  
  // Salvar método original
  const originalBuildBingoSeguro = analyzer.buildBingoSeguro.bind(analyzer);
  
  // Criar versão com Poisson
  const buildBingoSeguroWithPoisson = async function(games: any[]) {
    console.log(`🧪 [POISSON-TEST] Construindo bilhete com Poisson (${mode})...`);
    console.log(`📊 [POISSON-TEST] Jogos recebidos: ${games?.length || 0}`);
    
    // Chamar método original para obter baseline
    let baselineResult;
    try {
      console.log(`📊 [POISSON-TEST] Chamando analyzer.buildBingoSeguro com ${games.length} jogos...`);
      console.log(`📊 [POISSON-TEST] Primeiro jogo:`, games[0]);
      
      baselineResult = await originalBuildBingoSeguro(games);
      
      console.log(`📊 [POISSON-TEST] Baseline recebido:`, baselineResult);
      console.log(`📊 [POISSON-TEST] Tipo do baseline:`, typeof baselineResult);
      console.log(`📊 [POISSON-TEST] Baseline é null?:`, baselineResult === null);
      console.log(`📊 [POISSON-TEST] Baseline selections:`, baselineResult?.selections);
      console.log(`📊 [POISSON-TEST] Baseline keys:`, baselineResult ? Object.keys(baselineResult) : 'N/A');
      
    } catch (error) {
      console.error(`❌ [POISSON-TEST] Erro ao chamar método original:`, error);
      console.error(`❌ [POISSON-TEST] Stack:`, error instanceof Error ? error.stack : 'No stack available');
      return null;
    }
    
    if (!baselineResult) {
      console.log(`❌ [POISSON-TEST] Baseline não gerado - sem jogos suficientes ou erro`);
      return null;
    }
    
    console.log(`✅ [POISSON-TEST] Baseline gerado: ${baselineResult.selections?.length || 0} seleções`);
    console.log(`📊 [POISSON-TEST] Odd total: ${baselineResult.combinedOdd}`);
    console.log(`📊 [POISSON-TEST] Edge médio: ${baselineResult.expectedValue ? (baselineResult.expectedValue * 100).toFixed(1) : 'N/A'}%`);
    
    // Validar selections ou suggestions
    const selections = baselineResult.selections || baselineResult.suggestions;
    
    if (!selections || !Array.isArray(selections)) {
      console.error(`❌ [POISSON-TEST] Baseline não tem selections/suggestions válidas`);
      console.error(`❌ [POISSON-TEST] baselineResult.selections:`, baselineResult.selections);
      console.error(`❌ [POISSON-TEST] baselineResult.suggestions:`, baselineResult.suggestions);
      return null;
    }
    
    if (selections.length === 0) {
      console.log(`❌ [POISSON-TEST] Baseline tem 0 seleções - não é possível testar Poisson`);
      return null;
    }
    
    console.log(`✅ [POISSON-TEST] Baseline gerado: ${selections.length} seleções`);
    console.log(`📊 [POISSON-TEST] Odd total: ${baselineResult.combinedOdd}`);
    console.log(`📊 [POISSON-TEST] Edge médio: ${baselineResult.expectedValue ? (baselineResult.expectedValue * 100).toFixed(1) : 'N/A'}%`);
    
    // Simular análise Poisson para cada seleção
    const enhancedSelections = selections.map((selection: any) => {
      const mockGame = {
        match: selection.match,
        league: selection.league,
        avgGoalsHome: 1.5,
        avgGoalsAway: 1.2
      };
      
      const poissonResult = poissonCapsule.analyze(mockGame, selection.market, selection.odd);
      
      console.log(`🧪 [POISSON-TEST] ${selection.match}: ${selection.market}`);
      console.log(`   📊 Edge: ${selection.edge}% | Odd: ${selection.odd}`);
      console.log(`   🧮 Poisson: enabled=${poissonResult.enabled}, fairProb=${(poissonResult.fairProb * 100).toFixed(1)}%, modelEdge=${poissonResult.modelEdge.toFixed(1)}%`);
      console.log(`   🎯 Boost: ${poissonResult.confidenceBoost.toFixed(1)} pts`);
      console.log(`   📝 Reason: ${poissonResult.reason}`);
      
      return {
        ...selection,
        poissonData: {
          enabled: poissonResult.enabled,
          fairProb: poissonResult.fairProb,
          impliedProb: poissonResult.impliedProb,
          modelEdge: poissonResult.modelEdge,
          boost: poissonResult.confidenceBoost,
          veto: poissonResult.veto,
          mode: mode,
          reason: poissonResult.reason
        }
      };
    });
    
    // Retornar resultado enhanced
    const enhancedResult = {
      ...baselineResult,
      id: `bingo-seguro-poisson-${mode}-${Date.now()}`,
      selections: enhancedSelections,
      poissonMode: mode,
      poissonMetrics: metrics,
      testMode: true
    };
    
    console.log(`✅ [POISSON-TEST] Teste concluído: ${enhancedResult.selections.length} seleções com análise Poisson`);
    return enhancedResult;
  };
  
  // Aplicar wrapper no analyzer
  analyzer.buildBingoSeguro = buildBingoSeguroWithPoisson;
  
  console.log(`🔧 [POISSON-TEST] Wrapper aplicado ao analyzer`);
  
  return {
    originalMethod: originalBuildBingoSeguro,
    enhancedMethod: buildBingoSeguroWithPoisson,
    restore: () => {
      analyzer.buildBingoSeguro = originalBuildBingoSeguro;
      console.log(`🔄 [POISSON-TEST] Analyzer restaurado para modo original`);
    }
  };
}

// Função para executar teste A/B completo
export async function runPoissonABTest(analyzer: any, games: any[]) {
  console.log(`🧪 [A/B-TEST] Iniciando teste A/B Poisson completo...`);
  
  const results: any = {};
  
  // Testar baseline (off)
  console.log(`\n📊 [A/B-TEST] === BASELINE (OFF) ===`);
  const testOff = testPoissonIntegration(analyzer, games, 'off');
  results.baseline = await analyzer.buildBingoSeguro(games);
  testOff.restore();
  
  // Testar assist
  console.log(`\n📊 [A/B-TEST] === ASSIST ===`);
  const testAssist = testPoissonIntegration(analyzer, games, 'assist');
  results.assist = await analyzer.buildBingoSeguro(games);
  testAssist.restore();
  
  // Testar tie_breaker
  console.log(`\n📊 [A/B-TEST] === TIE_BREAKER ===`);
  const testTieBreaker = testPoissonIntegration(analyzer, games, 'tie_breaker');
  results.tie_breaker = await analyzer.buildBingoSeguro(games);
  testTieBreaker.restore();
  
  // Testar strict
  console.log(`\n📊 [A/B-TEST] === STRICT ===`);
  const testStrict = testPoissonIntegration(analyzer, games, 'strict');
  results.strict = await analyzer.buildBingoSeguro(games);
  testStrict.restore();
  
  // Comparação
  console.log(`\n📈 [A/B-TEST] === COMPARAÇÃO ===`);
  const comparison = compareResults(results);
  console.log(comparison);
  
  return { ...results, comparison };
}

// Função para comparar resultados
function compareResults(results: any): string {
  let report = `\n📈 RELATÓRIO COMPARATIVO A/B POISSON\n`;
  report += `═════════════════════════════════════════\n\n`;
  
  const modes = ['baseline', 'assist', 'tie_breaker', 'strict'];
  
  modes.forEach(mode => {
    const result = results[mode];
    if (result) {
      report += `🎯 ${mode.toUpperCase()}:\n`;
      report += `   Seleções: ${result.selections?.length || 0}\n`;
      report += `   Odd Total: ${result.combinedOdd?.toFixed(2) || 'N/A'}\n`;
      report += `   Edge Médio: ${result.expectedValue ? (result.expectedValue * 100).toFixed(1) : 'N/A'}%\n`;
      report += `   Poisson Mode: ${result.poissonMode || 'N/A'}\n`;
      report += `   Test Mode: ${result.testMode ? 'Sim' : 'Não'}\n\n`;
    }
  });
  
  // Melhorias vs baseline
  const baseline = results.baseline;
  if (baseline) {
    report += `📊 MELHORIAS VS BASELINE:\n`;
    modes.slice(1).forEach(mode => {
      const variant = results[mode];
      if (variant && baseline) {
        const edgeImprovement = variant.expectedValue && baseline.expectedValue 
          ? ((variant.expectedValue - baseline.expectedValue) / baseline.expectedValue) * 100 
          : 0;
        const oddChange = variant.combinedOdd && baseline.combinedOdd
          ? ((variant.combinedOdd - baseline.combinedOdd) / baseline.combinedOdd) * 100
          : 0;
        const selectionChange = baseline.selections && variant.selections
          ? ((variant.selections.length - baseline.selections.length) / baseline.selections.length) * 100
          : 0;
        
        report += `   ${mode.toUpperCase()}: `;
        report += `Edge ${edgeImprovement > 0 ? '+' : ''}${edgeImprovement.toFixed(1)}% | `;
        report += `Odd ${oddChange > 0 ? '+' : ''}${oddChange.toFixed(1)}% | `;
        report += `Seleções ${selectionChange > 0 ? '+' : ''}${selectionChange.toFixed(1)}%\n`;
      }
    });
  }
  
  return report;
}

// Disponibilizar globalmente no browser
if (typeof window !== 'undefined') {
  (window as any).testPoissonIntegration = testPoissonIntegration;
  (window as any).runPoissonABTest = runPoissonABTest;
  console.log(`🧪 [POISSON-TEST] Funções disponíveis no console:`);
  console.log(`   - testPoissonIntegration(analyzer, games, mode)`);
  console.log(`   - runPoissonABTest(analyzer, games)`);
}
