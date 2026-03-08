// 🧪 CÁPSULA POISSON EXPERIMENTAL
// Módulo plugável para validação de mercados com modelo estatístico

export interface PoissonCapsuleResult {
  enabled: boolean;
  market: string;
  fairProb: number;
  impliedProb: number;
  modelEdge: number;
  confidenceBoost: number;
  veto: boolean;
  reason: string;
}

export type PoissonMode = 'off' | 'assist' | 'tie_breaker' | 'strict';

export interface PoissonMarketConfig {
  enabled: boolean;
  minSamples: number;
  weightFactor: number;
  vetoThreshold: number;
}

// Configuração por mercado (experimental)
const POISSON_CONFIG: Record<string, PoissonMarketConfig> = {
  "Ambas Marcam — Sim": { enabled: true, minSamples: 30, weightFactor: 0.15, vetoThreshold: -5 },
  "Mais de 1.5 gols FT": { enabled: true, minSamples: 30, weightFactor: 0.12, vetoThreshold: -8 },
  "Mais de 2.5 gols FT": { enabled: true, minSamples: 30, weightFactor: 0.18, vetoThreshold: -6 },
  "Mais de 0.5 gols 1T": { enabled: true, minSamples: 25, weightFactor: 0.10, vetoThreshold: -10 },
};

export class PoissonCapsule {
  constructor(private mode: PoissonMode = 'off') {}

  /**
   * Calcula métricas Poisson para um mercado/jogo
   */
  analyze(game: any, market: string, odd: number): PoissonCapsuleResult {
    // Se modo off ou mercado não configurado
    if (this.mode === 'off' || !POISSON_CONFIG[market]) {
      return {
        enabled: false,
        market,
        fairProb: 0,
        impliedProb: 0,
        modelEdge: 0,
        confidenceBoost: 0,
        veto: false,
        reason: 'Poisson desativado ou mercado não suportado'
      };
    }

    const config = POISSON_CONFIG[market];
    
    try {
      // 🧮 Cálculo Poisson (simplificado para exemplo)
      const { fairProb, confidence, samples } = this.calculatePoissonProb(game, market);
      const impliedProb = 1 / odd;
      const modelEdge = ((fairProb - impliedProb) / impliedProb) * 100;

      // Verifica se há dados suficientes
      if (samples < config.minSamples) {
        return {
          enabled: false,
          market,
          fairProb,
          impliedProb,
          modelEdge,
          confidenceBoost: 0,
          veto: false,
          reason: `Insuficiente dados (${samples} < ${config.minSamples})`
        };
      }

      // Calcula boost de confiança baseado no edge do modelo
      let confidenceBoost = 0;
      let veto = false;
      let reason = '';

      if (this.mode === 'assist') {
        // Modo assist: bônus pequeno ao score
        confidenceBoost = Math.max(0, modelEdge * config.weightFactor);
        reason = `Assist boost: +${confidenceBoost.toFixed(1)} pts`;
      } else if (this.mode === 'tie_breaker') {
        // Modo tie-breaker: boost apenas para decisões de empate
        if (Math.abs(modelEdge) < 2) {
          confidenceBoost = modelEdge > 0 ? modelEdge * config.weightFactor : 0;
          reason = `Tie-breaker: edge ${modelEdge.toFixed(1)}% → boost +${confidenceBoost.toFixed(1)}`;
        } else {
          reason = `Tie-breaker: edge ${modelEdge.toFixed(1)}% → sem boost (diferença grande)`;
        }
      } else if (this.mode === 'strict') {
        // Modo strict: pode vetar mercados ruins
        if (modelEdge < config.vetoThreshold) {
          veto = true;
          reason = `VETO: edge ${modelEdge.toFixed(1)}% < threshold ${config.vetoThreshold}%`;
        } else {
          confidenceBoost = Math.max(0, modelEdge * config.weightFactor);
          reason = `Strict: edge ${modelEdge.toFixed(1)}% → boost +${confidenceBoost.toFixed(1)}`;
        }
      }

      return {
        enabled: true,
        market,
        fairProb,
        impliedProb,
        modelEdge,
        confidenceBoost,
        veto,
        reason
      };

    } catch (error) {
      return {
        enabled: false,
        market,
        fairProb: 0,
        impliedProb: 0,
        modelEdge: 0,
        confidenceBoost: 0,
        veto: false,
        reason: `Erro no cálculo: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Cálculo simplificado de probabilidade Poisson
   * (IMPLEMENTAR COM DADOS REAIS DO HISTÓRICO)
   */
  private calculatePoissonProb(game: any, market: string): {
    fairProb: number;
    confidence: number;
    samples: number;
  } {
    // 🧪 IMPLEMENTAÇÃO SIMPLIFICADA - SUBSTITUIR COM DADOS REAIS
    
    // Dados mockados para exemplo
    const historicalData = this.getMockHistoricalData(game, market);
    
    if (market.includes("Ambas Marcam")) {
      const lambdaHome = game.avgGoalsHome || 1.5;
      const lambdaAway = game.avgGoalsAway || 1.2;
      
      // P(Ambas marcam) = 1 - P(Casa não marca) - P(Fora não marca) + P(Nenhuma marca)
      const pHomeScores = 1 - Math.exp(-lambdaHome);
      const pAwayScores = 1 - Math.exp(-lambdaAway);
      const fairProb = pHomeScores * pAwayScores;
      
      return {
        fairProb,
        confidence: Math.min(0.95, historicalData.samples / 100),
        samples: historicalData.samples
      };
    }
    
    if (market.includes("gols")) {
      const totalGoals = this.extractGoalLine(market);
      const lambda = (game.avgGoalsHome || 1.5) + (game.avgGoalsAway || 1.2);
      
      // P(Gols > linha) usando distribuição Poisson
      let fairProb = 0;
      for (let k = totalGoals + 1; k <= 20; k++) {
        fairProb += (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
      }
      
      return {
        fairProb,
        confidence: Math.min(0.95, historicalData.samples / 100),
        samples: historicalData.samples
      };
    }
    
    // Fallback para mercados não implementados
    return {
      fairProb: 0.5,
      confidence: 0.5,
      samples: 0
    };
  }

  /**
   * Extrai linha de gols do mercado
   */
  private extractGoalLine(market: string): number {
    if (market.includes("0.5")) return 0;
    if (market.includes("1.5")) return 1;
    if (market.includes("2.5")) return 2;
    return 2;
  }

  /**
   * Função utilitária fatorial
   */
  private factorial(n: number): number {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }

  /**
   * Dados históricos mockados - SUBSTITUIR COM BANCO DE DADOS REAL
   */
  private getMockHistoricalData(game: any, market: string): {
    samples: number;
    hitRate: number;
  } {
    // 📊 DADOS HISTÓRICOS MOCK PARA TESTE
    const mockHistoricalData: Record<string, number[]> = {
      "Flamengo": Array.from({length: 50}, () => Math.random() * 4 + 0.5),
      "Vasco": Array.from({length: 50}, () => Math.random() * 3.5 + 0.3),
      "Palmeiras": Array.from({length: 50}, () => Math.random() * 3.8 + 0.4),
      "Corinthians": Array.from({length: 50}, () => Math.random() * 3.2 + 0.6),
      "AC Milan": Array.from({length: 50}, () => Math.random() * 3.6 + 0.4),
      "Inter": Array.from({length: 50}, () => Math.random() * 3.4 + 0.5),
      "default": Array.from({length: 50}, () => Math.random() * 3.0 + 0.8)
    };
    
    // Extrair nome do time home
    const homeTeam = game.match?.split(' x ')[0]?.trim() || 'default';
    const data = mockHistoricalData[homeTeam] || mockHistoricalData['default'];
    
    // Calcular hit rate baseado no mercado
    let hitRate = 0.5; // base
    if (market.includes('Ambas')) hitRate = 0.55;
    if (market.includes('1.5')) hitRate = 0.65;
    if (market.includes('2.5')) hitRate = 0.45;
    if (market.includes('0.5')) hitRate = 0.70;
    
    return { samples: data.length, hitRate };
  }

  /**
   * Métricas para teste A/B
   */
  getMetrics(): {
    mode: PoissonMode;
    enabledMarkets: string[];
    avgWeightFactor: number;
  } {
    const enabledMarkets = Object.entries(POISSON_CONFIG)
      .filter(([_, config]) => config.enabled)
      .map(([market]) => market);
    
    const avgWeightFactor = enabledMarkets.reduce((sum, market) => 
      sum + POISSON_CONFIG[market].weightFactor, 0) / enabledMarkets.length;
    
    return {
      mode: this.mode,
      enabledMarkets,
      avgWeightFactor
    };
  }
}

// 🎯 FÁBRICA PARA CRIAÇÃO DA CÁPSULA
export function createPoissonCapsule(mode: PoissonMode = 'off'): PoissonCapsule {
  return new PoissonCapsule(mode);
}
