// 🧪 EXEMPLO DE USO - INTEGRAÇÃO POISSON NO ANALYZER

import { integratePoissonInBuildBingoSeguro } from './bingo-seguro-poisson-integration';
import { PoissonMode } from './poisson-capsule';

// 🎯 CONFIGURAÇÃO DO TESTE A/B
export class PoissonABTest {
  private originalBuildBingoSeguro: Function;
  private enhancedVersions: Map<PoissonMode, Function> = new Map();
  
  constructor(private analyzerInstance: any) {
    // Salvar método original
    this.originalBuildBingoSeguro = analyzerInstance.buildBingoSeguro.bind(analyzerInstance);
    
    // Criar versões enhanced
    this.enhancedVersions.set('off', this.originalBuildBingoSeguro); // Baseline
    this.enhancedVersions.set('assist', integratePoissonInBuildBingoSeguro(this.originalBuildBingoSeguro, 'assist'));
    this.enhancedVersions.set('tie_breaker', integratePoissonInBuildBingoSeguro(this.originalBuildBingoSeguro, 'tie_breaker'));
    this.enhancedVersions.set('strict', integratePoissonInBuildBingoSeguro(this.originalBuildBingoSeguro, 'strict'));
  }
  
  /**
   * Executa teste A/B completo
   */
  async runABTest(games: any[]): Promise<{
    baseline: any;
    assist: any;
    tie_breaker: any;
    strict: any;
    comparison: any;
  }> {
    console.log('🧪 Iniciando teste A/B Poisson...');
    
    // Executar todas as versões
    const results = {
      baseline: await this.enhancedVersions.get('off')!(games),
      assist: await this.enhancedVersions.get('assist')!(games),
      tie_breaker: await this.enhancedVersions.get('tie_breaker')!(games),
      strict: await this.enhancedVersions.get('strict')!(games),
      comparison: null // será preenchido abaixo
    };
    
    // Comparação
    results.comparison = this.compareResults(results);
    
    console.log('🧪 Teste A/B concluído!');
    return results;
  }
  
  /**
   * Compara resultados entre versões
   */
  private compareResults(results: any): any {
    const { baseline, assist, tie_breaker, strict } = results;
    
    return {
      // Métricas de seleção
      selectionCount: {
        baseline: baseline?.selections?.length || 0,
        assist: assist?.selections?.length || 0,
        tie_breaker: tie_breaker?.selections?.length || 0,
        strict: strict?.selections?.length || 0
      },
      
      // Métricas de odd
      combinedOdd: {
        baseline: baseline?.combinedOdd || 0,
        assist: assist?.combinedOdd || 0,
        tie_breaker: tie_breaker?.combinedOdd || 0,
        strict: strict?.combinedOdd || 0
      },
      
      // Métricas de edge
      avgEdge: {
        baseline: baseline?.expectedValue || 0,
        assist: assist?.expectedValue || 0,
        tie_breaker: tie_breaker?.expectedValue || 0,
        strict: strict?.expectedValue || 0
      },
      
      // Métricas Poisson
      poissonMetrics: {
        assist: assist?.poissonMetrics || null,
        tie_breaker: tie_breaker?.poissonMetrics || null,
        strict: strict?.poissonMetrics || null
      },
      
      // Análise A/B
      improvement: {
        assist_vs_baseline: this.calculateImprovement(baseline, assist),
        tie_breaker_vs_baseline: this.calculateImprovement(baseline, tie_breaker),
        strict_vs_baseline: this.calculateImprovement(baseline, strict)
      }
    };
  }
  
  /**
   * Calcula melhoria percentual
   */
  private calculateImprovement(baseline: any, variant: any): any {
    if (!baseline || !variant) return null;
    
    const baselineEdge = baseline.expectedValue || 0;
    const variantEdge = variant.expectedValue || 0;
    
    const baselineOdd = baseline.combinedOdd || 0;
    const variantOdd = variant.combinedOdd || 0;
    
    return {
      edgeImprovement: baselineEdge > 0 ? ((variantEdge - baselineEdge) / baselineEdge) * 100 : 0,
      oddChange: baselineOdd > 0 ? ((variantOdd - baselineOdd) / baselineOdd) * 100 : 0,
      selectionChange: baseline.selections ? ((variant.selections.length - baseline.selections.length) / baseline.selections.length) * 100 : 0
    };
  }
  
  /**
   * Aplica versão específica ao analyzer
   */
  applyVersion(mode: PoissonMode): void {
    const enhancedMethod = this.enhancedVersions.get(mode);
    if (enhancedMethod) {
      this.analyzerInstance.buildBingoSeguro = enhancedMethod;
      console.log(`🔧 Versão ${mode.toUpperCase()} aplicada ao analyzer`);
    }
  }
  
  /**
   * Restaura versão original
   */
  restoreOriginal(): void {
    this.analyzerInstance.buildBingoSeguro = this.originalBuildBingoSeguro;
    console.log('🔧 Versão original (baseline) restaurada');
  }
}

// 🎯 EXEMPLO DE INTEGRAÇÃO NO ANALYZER
export function patchAnalyzerWithPoisson(analyzer: any, defaultMode: PoissonMode = 'off'): PoissonABTest {
  const abTest = new PoissonABTest(analyzer);
  
  // Aplicar versão padrão
  abTest.applyVersion(defaultMode);
  
  // Expor método para troca de modo
  analyzer.setPoissonMode = (mode: PoissonMode) => {
    abTest.applyVersion(mode);
  };
  
  // Expor método para teste A/B
  analyzer.runPoissonABTest = (games: any[]) => {
    return abTest.runABTest(games);
  };
  
  // Expor método para restaurar
  analyzer.restoreOriginalPoisson = () => {
    abTest.restoreOriginal();
  };
  
  console.log(`🧪 Analyzer patcheado com Poisson (modo: ${defaultMode})`);
  return abTest;
}

// 🎯 EXEMPLO DE USO NO CONTROLLER/ROUTE
/*
// No arquivo do analyzer ou controller:
import { patchAnalyzerWithPoisson, PoissonMode } from './poisson-ab-test';

// Aplicar patch com modo padrão
const poissonTest = patchAnalyzerWithPoisson(analyzerInstance, 'assist');

// Usar analyzer normalmente (agora com Poisson)
const result = await analyzerInstance.buildBingoSeguro(games);

// Trocar modo dinamicamente
await analyzerInstance.setPoissonMode('strict');
const strictResult = await analyzerInstance.buildBingoSeguro(games);

// Executar teste A/B completo
const abResults = await analyzerInstance.runPoissonABTest(games);
console.log('📊 Resultados A/B:', abResults.comparison);

// Restaurar original se necessário
analyzerInstance.restoreOriginalPoisson();
*/
