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
export async function runPoissonABTest(analyzer: any, input: string[]) {
  console.log(`🧪 [A/B-TEST] Iniciando teste A/B Poisson completo...`);
  
  // 📊 Extrair CSV text do input (contrato padronizado)
  const csvText = Array.isArray(input) ? input[0] : input;
  
  // 📊 Logs estruturados antes do A/B
  const structuredLogs = {
    gamesReceived: csvText ? csvText.split('\n').length - 1 : 0, // -1 para remover header
    gamesValid: 0,
    candidatesGenerated: 0,
    candidatesApproved: 0,
    finalSelections: 0,
    rejectedReasons: {} as Record<string, number>,
    inputType: typeof input
  };
  
  console.log(`📊 [A/B-TEST] === ANÁLISE PRÉVIA ===`);
  console.log(`📊 [A/B-TEST] Jogos recebidos: ${structuredLogs.gamesReceived}`);
  console.log(`📊 [A/B-TEST] Tipo de entrada: ${structuredLogs.inputType}`);
  console.log(`📊 [A/B-TEST] CSV lines: ${csvText ? csvText.split('\n').length : 0}`);
  
  if (csvText) {
    const lines = csvText.split('\n');
    console.log(`📊 [A/B-TEST] Header: ${lines[0]}`);
    if (lines.length > 1) {
      console.log(`📊 [A/B-TEST] Primeira linha: ${lines[1]}`);
    }
  }
  
  const results: any = {};
  
  // Testar baseline (off) com análise detalhada
  console.log(`\n📊 [A/B-TEST] === BASELINE (OFF) ===`);
  
  try {
    const baselineResult = await analyzer.buildBingoSeguro(input);
    
    // 📊 Análise estruturada do resultado
    const selections = baselineResult?.selections || baselineResult?.suggestions || [];
    structuredLogs.finalSelections = selections.length;
    
    console.log(`✅ [A/B-TEST] Baseline gerado com sucesso`);
    console.log(`📊 [A/B-TEST] Seleções finais: ${structuredLogs.finalSelections}`);
    
    if (selections.length > 0) {
      selections.slice(0, 3).forEach((s: any, i: number) => {
        console.log(`📊 [A/B-TEST] Seleção ${i+1}: ${s.match} | ${s.market} | Odd: ${s.odd}`);
      });
    } else {
      console.log(`❌ [A/B-TEST] PROBLEMA: Baseline gerou 0 seleções!`);
      
      // Tentar entender o motivo
      if (baselineResult?.summary) {
        console.log(`📊 [A/B-TEST] Summary:`, baselineResult.summary);
        structuredLogs.gamesValid = baselineResult.summary.totalGames || 0;
        structuredLogs.candidatesGenerated = baselineResult.summary.qualityGames || 0;
      }
      
      if (baselineResult?.games) {
        console.log(`📊 [A/B-TEST] Total games processados: ${baselineResult.games.length}`);
        baselineResult.games.forEach((g: any, i: number) => {
          if (i < 3) {
            console.log(`📊 [A/B-TEST] Jogo ${i+1}: ${g.match} | Score: ${g.score} | Conf: ${g.confidence}`);
          }
        });
      }
      
      structuredLogs.rejectedReasons['no_baseline_selections'] = 1;
    }
    
    results.baseline = baselineResult;
    
  } catch (error) {
    console.error(`❌ [A/B-TEST] Erro no baseline:`, error);
    structuredLogs.rejectedReasons['baseline_error'] = 1;
    results.baseline = null;
  }
  
  // 📊 Resumo estruturado
  console.log(`\n📊 [A/B-TEST] === RESUMO ESTRUTURADO ===`);
  console.log(`📊 Jogos recebidos: ${structuredLogs.gamesReceived}`);
  console.log(`📊 Tipo entrada: ${structuredLogs.inputType}`);
  console.log(`✅ Jogos válidos: ${structuredLogs.gamesValid}`);
  console.log(`🎯 Candidatos gerados: ${structuredLogs.candidatesGenerated}`);
  console.log(`✅ Candidatos aprovados: ${structuredLogs.candidatesApproved}`);
  console.log(`🎯 Seleções finais: ${structuredLogs.finalSelections}`);
  
  if (Object.keys(structuredLogs.rejectedReasons).length > 0) {
    console.log(`❌ Motivos de descarte:`, structuredLogs.rejectedReasons);
  }
  
  // Testar outros modos apenas se baseline tiver seleções
  if (structuredLogs.finalSelections === 0) {
    console.log(`❌ [A/B-TEST] Pulando outros modos - baseline sem seleções`);
    return { ...results, structuredLogs };
  }
  
  // Testar outros modos
  const modes = ['assist', 'tie_breaker', 'strict'];
  
  for (const mode of modes) {
    console.log(`\n📊 [A/B-TEST] === ${mode.toUpperCase()} ===`);
    const testMode = testPoissonIntegration(analyzer, input, mode as PoissonMode);
    results[mode] = await analyzer.buildBingoSeguro(input);
    testMode.restore();
  }
  
  // Comparação
  console.log(`\n📈 [A/B-TEST] === COMPARAÇÃO ===`);
  const comparison = compareResults(results);
  console.log(comparison);
  
  return { ...results, structuredLogs, comparison };
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
