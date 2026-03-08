// 🎯 GUIA RÁPIDO - IMPLEMENTAÇÃO POISSON

## 📋 ESTRUTURA CRIADA

### 1. CÁPSULA POISSON (`poisson-capsule.ts`)
```typescript
// 4 modos de operação
type PoissonMode = 'off' | 'assist' | 'tie_breaker' | 'strict';

// Configuração por mercado
const POISSON_CONFIG = {
  "Ambas Marcam — Sim": { weightFactor: 0.15, vetoThreshold: -5 },
  "Mais de 2.5 gols FT": { weightFactor: 0.18, vetoThreshold: -6 },
  "Mais de 1.5 gols FT": { weightFactor: 0.12, vetoThreshold: -8 },
  "Mais de 0.5 gols 1T": { weightFactor: 0.10, vetoThreshold: -10 }
};

// Uso simples
const poissonCapsule = createPoissonCapsule('assist');
const result = poissonCapsule.analyze(game, market, odd);
```

### 2. INTEGRAÇÃO NO BUILDBINGOSEGURO (`bingo-seguro-poisson-integration.ts`)
```typescript
// Wrapper não invasivo
const enhancedBuildBingoSeguro = integratePoissonInBuildBingoSeguro(
  originalBuildBingoSeguro,
  'assist'  // modo Poisson
);

// Uso
const result = await enhancedBuildBingoSeguro(games);
```

### 3. TESTE A/B (`poisson-ab-test.ts`)
```typescript
// Patch no analyzer
const poissonTest = patchAnalyzerWithPoisson(analyzer, 'assist');

// Trocar modo dinamicamente
analyzer.setPoissonMode('strict');

// Teste A/B completo
const abResults = await analyzer.runPoissonABTest(games);
```

## 🔧 PONTOS DE INJEÇÃO

### **1. ANÁLISE POISSON**
```typescript
const poissonResult = poissonCapsule.analyze(g, market, odd);
```

### **2. VERIFICAÇÃO VETO**
```typescript
if (poissonResult.veto) {
  console.log(`🚫 VETO Poisson: ${poissonResult.reason}`);
  continue;
}
```

### **3. APLICAÇÃO BOOST**
```typescript
let poissonBoost = 0;
if (poissonResult.enabled && !poissonResult.veto) {
  poissonBoost = poissonResult.confidenceBoost;
  finalScore += poissonBoost;
}
```

### **4. LOG COMPLETO**
```typescript
console.log(`[BINGO-SEGURO] ${g.match}: ${market} | família=${family} | edge=${edge}% | conf=${conf} | prio=${prio} | ajuste=${ajuste} | fairProb=${(poissonResult.fairProb * 100).toFixed(1)}% | implied=${(poissonResult.impliedProb * 100).toFixed(1)}% | modelEdge=${poissonResult.modelEdge.toFixed(1)}% | poissonBoost=${poissonBoost > 0 ? '+' : ''}${poissonBoost.toFixed(1)} | score=${finalScore.toFixed(1)} | ${poissonResult.reason}`);
```

### **5. MÉTRICAS A/B**
```typescript
abTestMetrics.push({
  strategyVersion: 'bingoSeguro',
  poissonMode,
  market,
  family,
  edge,
  confidence,
  scoreBase: edge + (conf/10) + prio + ajuste - poissonBoost,
  scoreFinal: finalScore,
  poissonFairProb: poissonResult.fairProb,
  poissonModelEdge: poissonResult.modelEdge,
  selected: false,
  result: null,
  profit: null,
  roi: null
});
```

## 📊 MÉTRICAS COLETADAS

### **Por Sugestão**
- `strategyVersion`: bingoSeguro
- `poissonMode`: off/assist/tie_breaker/strict
- `market`: "Ambas Marcam — Sim"
- `family`: btts/goals_ft/corners_ft/goals_ht/other
- `edge`: 25.5 (%)
- `confidence`: 0.78
- `scoreBase`: 38.2 (sem Poisson)
- `scoreFinal`: 41.7 (com Poisson)
- `poissonFairProb`: 0.62
- `poissonModelEdge`: 8.3%
- `selected`: true/false
- `result`: null (pre-jogo)
- `profit`: null (pós-jogo)
- `roi`: null (pós-jogo)

### **Agregadas**
- Hit rate por modo
- ROI por modo
- Lucro por 100 apostas
- Odd média por modo
- Distribuição por família
- Performance por mercado
- Performance por faixa de odd

## 🎮 EXEMPLO DE USO

### **BÁSICO**
```typescript
// Criar cápsula
const poissonCapsule = createPoissonCapsule('assist');

// Analisar mercado
const result = poissonCapsule.analyze(game, "Ambas Marcam — Sim", 2.25);
if (result.enabled && !result.veto) {
  console.log(`Boost: +${result.confidenceBoost} pts`);
}
```

### **INTEGRAÇÃO**
```typescript
// Patch no analyzer
patchAnalyzerWithPoisson(analyzer, 'assist');

// Usar normalmente (agora com Poisson)
const result = await analyzer.buildBingoSeguro(games);
```

### **TESTE A/B**
```typescript
// Teste completo
const abResults = await analyzer.runPoissonABTest(games);

// Ver comparação
console.log('Melhoria edge:', abResults.comparison.improvement.assist_vs_baseline.edgeImprovement);
console.log('Mudança odd:', abResults.comparison.improvement.assist_vs_baseline.oddChange);
```

## 🎯 CONFIGURAÇÃO RECOMENDADA

### **FASE 1 - VALIDAÇÃO**
```typescript
// Modo conservador para validação
const mode: PoissonMode = 'assist';
```

### **FASE 2 - OTIMIZAÇÃO**
```typescript
// Testar diferentes modos
const modes: PoissonMode[] = ['assist', 'tie_breaker', 'strict'];
```

### **FASE 3 - PRODUÇÃO**
```typescript
// Escolher melhor modo baseado nos resultados
const bestMode = analyzeABTestResults(abResults);
```

## 📈 CRITÉRIOS DE AVALIAÇÃO

### **PRIMÁRIOS**
- **ROI**: Retorno sobre investimento
- **Hit Rate**: Taxa de acerto
- **Lucro por 100 apostas**: Rentabilidade

### **SECUNDÁRIOS**
- **Odd média**: Risco/retorno
- **Distribuição familiar**: Diversificação
- **Performance por mercado**: Efetividade

### **AVANÇADOS**
- **Performance por liga**: Contexto específico
- **Performance por odd range**: Otimização
- **Consistência temporal**: Estabilidade

## 🚀 PRÓXIMOS PASSOS

1. **Implementar dados históricos reais** na cápsula Poisson
2. **Configurar coleta de resultados** pós-jogo
3. **Criar dashboard** de métricas A/B
4. **Ajustar pesos** baseado nos resultados
5. **Expandir mercados** com mais dados

## ⚠️ IMPORTANTE

- **Não substituir motor atual** - apenas complementar
- **Fallback automático** se Poisson falhar
- **Teste A/B controlado** antes de produção
- **Monitorar métricas** continuamente
- **Desligar se não melhorar** performance

**A cápsula Poisson está pronta para teste experimental!** 🧪
