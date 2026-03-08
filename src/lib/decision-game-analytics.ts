// Camada 4 - Validação Histórica DecisionGame (Mapa de Decisão v1)
// Métricas por dominantReading e coerência com mainMarket

import { DecisionGame } from '../types/decision-game';

// 🆕 Status operacional para triagem
export type ReadingStatus = 'approved' | 'watch' | 'blocked';

// Interface para métricas por dominantReading
export interface DecisionGameMetrics {
  dominantReading: string;
  amostra: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  oddMedia: number;
  totalStake: number;
  totalProfit: number;
  // 🆕 Campos para triagem operacional
  status: ReadingStatus;
  fallback: number;
  motivo: string;
}

// Interface para métricas de coerência
export interface CoherenceMetrics {
  totalJogos: number;
  jogosCompativeis: number;
  jogosFallback: number;
  coerenciaPercentual: number;
}

// 🆕 Thresholds configuráveis para classificação
const THRESHOLDS = {
  amostraMinima: 10,        // amostra mínima para confiança
  hitRateMinimo: 45,        // hit rate mínimo em %
  roiMinimo: 5,             // ROI mínimo em %
  fallbackMaximo: 30,       // % máximo de fallback tolerado
  amostraMuitoBaixa: 5      // amostra muito baixa (alerta)
};

// 🆕 Classificar dominantReading com critérios explícitos
function classifyReading(
  baseMetrics: Omit<DecisionGameMetrics, 'status' | 'fallback' | 'motivo'>, 
  coherence: CoherenceMetrics
): ReadingStatus {
  const { amostra, hitRate, roi } = baseMetrics;
  const { coerenciaPercentual } = coherence;
  
  // Bloqueados: amostra muito baixa ou performance ruim
  if (amostra < THRESHOLDS.amostraMuitoBaixa) return 'blocked';
  if (hitRate < THRESHOLDS.hitRateMinimo - 10) return 'blocked';
  if (roi < -10) return 'blocked';
  
  // Aprovados: critérios mínimos atendidos
  if (amostra >= THRESHOLDS.amostraMinima && 
      hitRate >= THRESHOLDS.hitRateMinimo && 
      roi >= THRESHOLDS.roiMinimo &&
      coerenciaPercentual >= 70) {
    return 'approved';
  }
  
  // Watch: borderline
  return 'watch';
}

// 🆕 Gerar motivo da classificação
function generateClassificationReason(
  baseMetrics: Omit<DecisionGameMetrics, 'status' | 'fallback' | 'motivo'>, 
  coherence: CoherenceMetrics
): string {
  const { amostra, hitRate, roi } = baseMetrics;
  const { coerenciaPercentual } = coherence;
  
  // Classificar aqui para gerar motivo
  const status = classifyReading(baseMetrics, coherence);
  
  switch (status) {
    case 'approved':
      return `Amostra sólida (${amostra}), HR ${hitRate.toFixed(1)}%, ROI ${roi.toFixed(1)}%, coerência ${coerenciaPercentual.toFixed(1)}%`;
    
    case 'blocked':
      if (amostra < THRESHOLDS.amostraMuitoBaixa) {
        return `Amostra muito baixa (${amostra} < ${THRESHOLDS.amostraMuitoBaixa})`;
      }
      if (hitRate < THRESHOLDS.hitRateMinimo - 10) {
        return `Hit rate muito baixo (${hitRate.toFixed(1)}% < ${THRESHOLDS.hitRateMinimo - 10}%)`;
      }
      if (roi < -10) {
        return `ROI muito negativo (${roi.toFixed(1)}%)`;
      }
      return `Múltiplos critérios reprovados`;
    
    case 'watch':
      const reasons = [];
      if (amostra < THRESHOLDS.amostraMinima) reasons.push(`amostra ${amostra} < ${THRESHOLDS.amostraMinima}`);
      if (hitRate < THRESHOLDS.hitRateMinimo) reasons.push(`HR ${hitRate.toFixed(1)}% < ${THRESHOLDS.hitRateMinimo}%`);
      if (roi < THRESHOLDS.roiMinimo) reasons.push(`ROI ${roi.toFixed(1)}% < ${THRESHOLDS.roiMinimo}%`);
      if (coerenciaPercentual < 70) reasons.push(`coerência ${coerenciaPercentual.toFixed(1)}% < 70%`);
      return reasons.join(', ');
    
    default:
      return 'Status desconhecido';
  }
}

// Calcular métricas por dominantReading com classificação operacional
export function calculateMetricsByDominantReading(decisionGames: DecisionGame[]): DecisionGameMetrics[] {
  const grouped = decisionGames.reduce((acc, game) => {
    const reading = game.dominantReading;
    if (!acc[reading]) {
      acc[reading] = {
        games: [],
        totalStake: 0,
        totalProfit: 0
      };
    }
    acc[reading].games.push(game);
    // Extrair resultado do mainMarket (se disponível no futuro)
    // Por ora, assume resultado baseado em odd e profit simulados
    acc[reading].totalStake += 1; // stake unitário
    acc[reading].totalProfit += calculateSimulatedProfit(game);
    return acc;
  }, {} as Record<string, { games: DecisionGame[], totalStake: number, totalProfit: number }>);

  // Calcular coerência para usar na classificação
  const coherence = calculateCoherenceMetrics(decisionGames);

  return Object.entries(grouped).map(([reading, data]) => {
    const wins = data.games.filter(g => calculateSimulatedWin(g)).length;
    const losses = data.games.length - wins;
    
    const baseMetrics = {
      dominantReading: reading,
      amostra: data.games.length,
      wins,
      losses,
      hitRate: data.games.length > 0 ? (wins / data.games.length) * 100 : 0,
      roi: data.totalStake > 0 ? (data.totalProfit / data.totalStake) * 100 : 0,
      oddMedia: calculateAverageOdd(data.games),
      totalStake: data.totalStake,
      totalProfit: data.totalProfit
    };

    // 🆕 Adicionar classificação operacional
    const status = classifyReading(baseMetrics, coherence);
    const fallback = calculateFallbackForReading(reading, data.games);
    const motivo = generateClassificationReason(baseMetrics, coherence);

    return {
      ...baseMetrics,
      status,
      fallback,
      motivo
    };
  }).sort((a, b) => b.amostra - a.amostra);
}

// 🆕 Calcular percentual de fallback para uma leitura
function calculateFallbackForReading(reading: string, games: DecisionGame[]): number {
  const fallbackGames = games.filter(g => g.dominantReading === 'unknown' || 
    !checkMarketCompatibility(g.dominantReading, g.mainMarket.market));
  return games.length > 0 ? (fallbackGames.length / games.length) * 100 : 0;
}

// Calcular métricas de coerência (dominantReading vs mainMarket)
export function calculateCoherenceMetrics(decisionGames: DecisionGame[]): CoherenceMetrics {
  const totalJogos = decisionGames.length;
  let jogosCompativeis = 0;
  let jogosFallback = 0;

  decisionGames.forEach(game => {
    const isCompatible = checkMarketCompatibility(game.dominantReading, game.mainMarket.market);
    if (isCompatible) {
      jogosCompativeis++;
    } else if (game.dominantReading === 'unknown') {
      jogosFallback++;
    }
  });

  return {
    totalJogos,
    jogosCompativeis,
    jogosFallback,
    coerenciaPercentual: totalJogos > 0 ? (jogosCompativeis / totalJogos) * 100 : 0
  };
}

// Helper: verificar compatibilidade entre dominantReading e mainMarket
function checkMarketCompatibility(dominantReading: string, mainMarket: string): boolean {
  const market = mainMarket.toLowerCase();
  
  switch (dominantReading) {
    case 'goals':
      return market.includes('over 1.5') || market.includes('over 2.5');
    case 'btts':
      return market.includes('ambas') || market.includes('btts');
    case 'corners':
      return market.includes('cantos') || market.includes('corners');
    case 'htPressure':
      return market.includes('ht') || market.includes('primeiro tempo');
    case 'shots':
      return market.includes('finaliza') || market.includes('shots');
    case 'offensive':
      return market.includes('ofensiv') || market.includes('combo');
    default:
      return false;
  }
}

// Helper: calcular profit simulado (placeholder)
function calculateSimulatedProfit(game: DecisionGame): number {
  // Simulação baseada na odd - 50% de chance de win
  const isWin = Math.random() > 0.5;
  return isWin ? (game.mainMarket.odd - 1) : -1;
}

// Helper: calcular win simulado (placeholder)
function calculateSimulatedWin(game: DecisionGame): boolean {
  // Simulação baseada na odd - odds maiores têm menor chance
  const winChance = Math.min(0.6, 1 / game.mainMarket.odd);
  return Math.random() < winChance;
}

// Helper: calcular odd média
function calculateAverageOdd(games: DecisionGame[]): number {
  const validOdds = games.map(g => g.mainMarket.odd).filter(odd => odd > 0);
  return validOdds.length > 0 ? validOdds.reduce((sum, odd) => sum + odd, 0) / validOdds.length : 0;
}
