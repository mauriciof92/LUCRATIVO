// 📊 PERSISTÊNCIA DE MÉTRICAS A/B - IMPLEMENTAÇÃO

// Interface para métricas A/B persistíveis
export interface ABTestMetricPersistent {
  id: string;
  timestamp: number;
  strategyVersion: string;
  poissonMode: string;
  market: string;
  family: string;
  edge: number;
  confidence: number;
  scoreBase: number;
  scoreFinal: number;
  poissonFairProb: number;
  poissonModelEdge: number;
  selected: boolean;
  result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual" | null;
  profit: number | null;
  roi: number | null;
  match: string;
  league: string;
  odd: number;
  combinedOdd: number;
}

// Função para salvar métricas A/B em localStorage
export function saveABTestMetrics(metrics: ABTestMetricPersistent[]): void {
  try {
    const existing = getABTestMetrics();
    const updated = [...existing, ...metrics];
    localStorage.setItem('ab-test-metrics', JSON.stringify(updated));
    console.log(`[AB-TEST] 💾 Salvas ${metrics.length} métricas A/B (total: ${updated.length})`);
  } catch (error) {
    console.error('[AB-TEST] ❌ Erro ao salvar métricas:', error);
  }
}

// Função para recuperar métricas A/B do localStorage
export function getABTestMetrics(): ABTestMetricPersistent[] {
  try {
    const stored = localStorage.getItem('ab-test-metrics');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[AB-TEST] ❌ Erro ao recuperar métricas:', error);
    return [];
  }
}

// Função para atualizar resultado de métricas existentes
export function updateABTestResult(
  suggestionId: string, 
  result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual",
  profit: number
): void {
  try {
    const metrics = getABTestMetrics();
    const updated = metrics.map(m => {
      if (m.id === suggestionId) {
        return { ...m, result, profit, roi: profit > 0 ? (profit / 25) * 100 : -100 };
      }
      return m;
    });
    localStorage.setItem('ab-test-metrics', JSON.stringify(updated));
    console.log(`[AB-TEST] 📊 Atualizado resultado para ${suggestionId}: ${result} (profit: ${profit})`);
  } catch (error) {
    console.error('[AB-TEST] ❌ Erro ao atualizar resultado:', error);
  }
}

// Função para analisar performance A/B
export function analyzeABTestPerformance(): {
  const metrics = getABTestMetrics();
  
  const byMode = metrics.reduce((acc, m) => {
    if (!acc[m.poissonMode]) {
      acc[m.poissonMode] = {
        total: 0,
        selected: 0,
        wins: 0,
        profit: 0,
        stake: 25 * m.selected,
        avgEdge: 0,
        avgScoreBase: 0,
        avgScoreFinal: 0,
        avgPoissonEdge: 0
      };
    }
    
    const mode = acc[m.poissonMode];
    mode.total++;
    if (m.selected) mode.selected++;
    if (m.result === 'win') mode.wins++;
    if (m.profit !== null) mode.profit += m.profit;
    mode.avgEdge += m.edge;
    mode.avgScoreBase += m.scoreBase;
    mode.avgScoreFinal += m.scoreFinal;
    mode.avgPoissonEdge += m.poissonModelEdge;
    
    return acc;
  }, {} as any);
  
  // Calcular médias
  Object.keys(byMode).forEach(mode => {
    const data = byMode[mode];
    data.hitRate = data.selected > 0 ? (data.wins / data.selected) * 100 : 0;
    data.roi = data.profit > 0 ? (data.profit / (data.stake * data.selected)) * 100 : 0;
    data.avgEdge = data.selected > 0 ? data.avgEdge / data.selected : 0;
    data.avgScoreBase = data.selected > 0 ? data.avgScoreBase / data.selected : 0;
    data.avgScoreFinal = data.selected > 0 ? data.avgScoreFinal / data.selected : 0;
    data.avgPoissonEdge = data.selected > 0 ? data.avgPoissonEdge / data.selected : 0;
  });
  
  return byMode;
}

// Função para gerar relatório A/B
export function generateABTestReport(): string {
  const performance = analyzeABTestPerformance();
  const metrics = getABTestMetrics();
  
  let report = `📊 RELATÓRIO A/B POISSON\n`;
  report += `📅 Período: ${new Date().toLocaleDateString()}\n`;
  report += `📊 Total de métricas: ${metrics.length}\n\n`;
  
  Object.entries(performance).forEach(([mode, data]) => {
    report += `🎯 MODO: ${mode.toUpperCase()}\n`;
    report += `   Seleções: ${data.selected}/${data.total}\n`;
    report += `   Hit Rate: ${data.hitRate.toFixed(1)}%\n`;
    report += `   ROI: ${data.roi.toFixed(1)}%\n`;
    report += `   Lucro: R$${data.profit.toFixed(2)}\n`;
    report += `   Edge médio: ${data.avgEdge.toFixed(1)}%\n`;
    report += `   Score base: ${data.avgScoreBase.toFixed(1)}\n`;
    report += `   Score final: ${data.avgScoreFinal.toFixed(1)}\n`;
    report += `   Edge Poisson: ${data.avgPoissonEdge.toFixed(1)}%\n\n`;
  });
  
  // Comparação com baseline
  const baseline = performance['off'] || { hitRate: 0, roi: 0, profit: 0 };
  Object.entries(performance).forEach(([mode, data]) => {
    if (mode !== 'off') {
      const hitRateImprovement = data.hitRate - baseline.hitRate;
      const roiImprovement = data.roi - baseline.roi;
      const profitImprovement = data.profit - baseline.profit;
      
      report += `📈 ${mode.toUpperCase()} vs BASELINE:\n`;
      report += `   Hit Rate: ${hitRateImprovement > 0 ? '+' : ''}${hitRateImprovement.toFixed(1)}%\n`;
      report += `   ROI: ${roiImprovement > 0 ? '+' : ''}${roiImprovement.toFixed(1)}%\n`;
      report += `   Lucro: R$${profitImprovement > 0 ? '+' : ''}${profitImprovement.toFixed(2)}\n\n`;
    }
  });
  
  return report;
}
