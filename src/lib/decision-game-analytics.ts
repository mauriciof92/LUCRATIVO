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

// 🆕 Interface para sanity check analítico
export interface SanityCheck {
  dominantReading: string;
  faixa: string;
  tipo: 'odd' | 'score' | 'confidence';
  amostra: number;
  wins: number;
  losses: number;
  oddMedia: number;
  roiRecalculado: number;
  inconsistencia: string;
  severidade: 'critica' | 'suspeita' | 'ok';
}

// 🆕 Interface para métricas por faixa operacional
export interface RangeMetrics {
  dominantReading: string;
  faixa: string;
  tipo: 'odd' | 'score' | 'confidence';
  amostra: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  oddMedia: number;
  status: 'saudavel' | 'perigoso' | 'insuficiente';
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

// 🆕 Calcular sanity check analítico
export function calculateSanityCheck(decisionGames: DecisionGame[]): SanityCheck[] {
  const sanityChecks: SanityCheck[] = [];

  // Agrupar por dominantReading e calcular faixas
  const groupedByReading = decisionGames.reduce((acc, game) => {
    if (!acc[game.dominantReading]) {
      acc[game.dominantReading] = [];
    }
    acc[game.dominantReading].push(game);
    return acc;
  }, {} as Record<string, DecisionGame[]>);

  Object.entries(groupedByReading).forEach(([reading, games]) => {
    // Faixas de Odd para sanity check
    const oddRanges = [
      { label: '< 1.30', min: 0, max: 1.29 },
      { label: '1.30 a 1.49', min: 1.30, max: 1.49 },
      { label: '1.50 a 1.79', min: 1.50, max: 1.79 },
      { label: '1.80+', min: 1.80, max: Infinity }
    ];

    oddRanges.forEach(range => {
      const gamesInRange = games.filter(g => 
        g.mainMarket.odd >= range.min && g.mainMarket.odd <= range.max &&
        g.mainMarket.result !== 'pending_manual' // apenas jogos resolvidos
      );
      
      if (gamesInRange.length > 0) {
        sanityChecks.push(calculateSanityForGames(reading, range.label, 'odd', gamesInRange));
      }
    });
  });

  return sanityChecks.filter(check => check.severidade !== 'ok'); // apenas problemas
}

// 🆕 Helper para calcular sanity de uma faixa específica
function calculateSanityForGames(
  dominantReading: string, 
  faixa: string, 
  tipo: 'odd' | 'score' | 'confidence', 
  games: DecisionGame[]
): SanityCheck {
  const wins = games.filter(g => g.mainMarket.result === 'win').length;
  const losses = games.filter(g => g.mainMarket.result === 'lose').length;
  const totalProfit = games.reduce((sum, g) => sum + g.mainMarket.profit, 0);
  const roiRecalculado = games.length > 0 ? (totalProfit / games.length) * 100 : 0;
  const oddMedia = games.reduce((sum, g) => sum + g.mainMarket.odd, 0) / games.length;

  // 🆕 Detecção de inconsistências matemáticas
  let inconsistencia = '';
  let severidade: 'critica' | 'suspeita' | 'ok' = 'ok';

  // Inconsistência crítica: wins > 0, losses = 0, ROI negativo
  if (wins > 0 && losses === 0 && roiRecalculado < 0) {
    inconsistencia = `ROI negativo (${roiRecalculado.toFixed(1)}%) com ${wins} wins e 0 losses - impossível matematicamente`;
    severidade = 'critica';
  }
  // Inconsistência crítica: wins = 0, losses > 0, ROI positivo
  else if (wins === 0 && losses > 0 && roiRecalculado > 0) {
    inconsistencia = `ROI positivo (${roiRecalculado.toFixed(1)}%) com 0 wins e ${losses} losses - impossível matematicamente`;
    severidade = 'critica';
  }
  // Inconsistência suspeita: ROI muito fora do esperado para hit rate
  else if (wins > 0 && losses > 0) {
    const hitRate = (wins / (wins + losses)) * 100;
    const roiEsperado = (hitRate / 100) * oddMedia * 100 - 100; // ROI teórico
    const diferencaROI = Math.abs(roiRecalculado - roiEsperado);
    
    if (diferencaROI > 30) { // mais de 30% de diferença
      inconsistencia = `ROI (${roiRecalculado.toFixed(1)}%) muito diferente do esperado (${roiEsperado.toFixed(1)}%) para HR ${hitRate.toFixed(1)}% e odd ${oddMedia.toFixed(2)}`;
      severidade = 'suspeita';
    }
  }

  return {
    dominantReading,
    faixa,
    tipo,
    amostra: games.length,
    wins,
    losses,
    oddMedia,
    roiRecalculado,
    inconsistencia,
    severidade
  };
}

// 🆕 Calcular envelope operacional por faixas
export function calculateRangeMetrics(decisionGames: DecisionGame[]): RangeMetrics[] {
  const rangeMetrics: RangeMetrics[] = [];

  // Agrupar por dominantReading
  const groupedByReading = decisionGames.reduce((acc, game) => {
    if (!acc[game.dominantReading]) {
      acc[game.dominantReading] = [];
    }
    acc[game.dominantReading].push(game);
    return acc;
  }, {} as Record<string, DecisionGame[]>);

  // Para cada dominantReading, calcular faixas
  Object.entries(groupedByReading).forEach(([reading, games]) => {
    // 📊 Faixas de Odd
    const oddRanges = [
      { label: '< 1.30', min: 0, max: 1.29 },
      { label: '1.30 a 1.49', min: 1.30, max: 1.49 },
      { label: '1.50 a 1.79', min: 1.50, max: 1.79 },
      { label: '1.80+', min: 1.80, max: Infinity }
    ];

    oddRanges.forEach(range => {
      const gamesInRange = games.filter(g => 
        g.mainMarket.odd >= range.min && g.mainMarket.odd <= range.max
      );
      
      if (gamesInRange.length > 0) {
        rangeMetrics.push(calculateRangeMetricsForGames(reading, range.label, 'odd', gamesInRange));
      }
    });

    // 📊 Faixas de Score
    const scoreRanges = [
      { label: '< 40', min: 0, max: 39 },
      { label: '40 a 59', min: 40, max: 59 },
      { label: '60 a 79', min: 60, max: 79 },
      { label: '80+', min: 80, max: 100 }
    ];

    scoreRanges.forEach(range => {
      const gamesInRange = games.filter(g => 
        g.debugMeta.originalScore >= range.min && g.debugMeta.originalScore <= range.max
      );
      
      if (gamesInRange.length > 0) {
        rangeMetrics.push(calculateRangeMetricsForGames(reading, range.label, 'score', gamesInRange));
      }
    });

    // 📊 Faixas de Confidence
    const confidenceRanges = [
      { label: '< 30%', min: 0, max: 29 },
      { label: '30% a 49%', min: 30, max: 49 },
      { label: '50% a 69%', min: 50, max: 69 },
      { label: '70%+', min: 70, max: 100 }
    ];

    confidenceRanges.forEach(range => {
      const gamesInRange = games.filter(g => 
        g.debugMeta.originalConfidence >= range.min && g.debugMeta.originalConfidence <= range.max
      );
      
      if (gamesInRange.length > 0) {
        rangeMetrics.push(calculateRangeMetricsForGames(reading, range.label, 'confidence', gamesInRange));
      }
    });
  });

  return rangeMetrics.sort((a, b) => b.amostra - a.amostra);
}

// 🆕 Helper para calcular métricas de uma faixa específica
function calculateRangeMetricsForGames(
  dominantReading: string, 
  faixa: string, 
  tipo: 'odd' | 'score' | 'confidence', 
  games: DecisionGame[]
): RangeMetrics {
  // 🆕 Usar resultado real do mainMarket em vez de simulação
  const wins = games.filter(g => {
    const result = g.mainMarket.result;
    return result === 'win';
  }).length;
  
  const losses = games.filter(g => {
    const result = g.mainMarket.result;
    return result === 'lose';
  }).length;
  
  const pending = games.filter(g => g.mainMarket.result === 'pending_manual').length;
  const totalResolved = wins + losses;
  
  const hitRate = totalResolved > 0 ? (wins / totalResolved) * 100 : 0;
  
  // 🆕 Calcular ROI usando profit real do mainMarket
  const totalProfit = games.reduce((sum, g) => {
    if (g.mainMarket.result === 'win') {
      return sum + (g.mainMarket.profit || 0);
    } else if (g.mainMarket.result === 'lose') {
      return sum + (g.mainMarket.profit || 0);
    }
    return sum; // pending não afeta ROI ainda
  }, 0);
  
  const roi = totalResolved > 0 ? (totalProfit / totalResolved) * 100 : 0;
  const oddMedia = calculateAverageOdd(games);

  // 🆕 Classificar faixa como saudável/perigoso/insuficiente
  let status: 'saudavel' | 'perigoso' | 'insuficiente';
  
  if (totalResolved < 5) {
    status = 'insuficiente';
  } else if (hitRate >= 50 && roi >= 0) {
    status = 'saudavel';
  } else if (hitRate < 35 || roi < -10) {
    status = 'perigoso';
  } else {
    status = 'saudavel'; // borderline considerado saudável
  }

  return {
    dominantReading,
    faixa,
    tipo,
    amostra: totalResolved, // apenas jogos resolvidos
    wins,
    losses,
    hitRate,
    roi,
    oddMedia,
    status
  };
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
