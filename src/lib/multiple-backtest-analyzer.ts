import { readFileSync } from 'fs';
import { join } from 'path';

// Interface para resultados do backtest
interface BacktestResult {
  id: string;
  match: string;
  league: string;
  hour: string;
  status: string;
  resultHome: number;
  resultAway: number;
  ftGoals: number;
  mainMarket: {
    label: string;
    odd: number;
    minOdd: number;
    stake: number;
    result: string;
    profit: number;
    hasValue: boolean;
  };
  combo: Array<{
    label: string;
    odd: number;
    minOdd: number;
    stake: number;
    result: string;
    profit: number;
    hasValue: boolean;
  }>;
  score: number;
  profile: string;
  confidence: number;
}

interface PatternAnalysis {
  pattern: string;
  totalOccurrences: number;
  successRate: number;
  avgOdd: number;
  profit: number;
  roi: number;
  matches: string[];
}

interface MultipleSuggestion {
  id: string;
  type: "bingoSeguro" | "bingoAlavanc";
  confidence: number;
  expectedValue: number;
  selections: Array<{
    match: string;
    league: string;
    hour: string;
    market: string;
    odd: number;
    reason: string;
  }>;
  combinedOdd: number;
  suggestedStake: number;
  expectedReturn: number;
  historicalSuccessRate: number;
}

// Função para carregar e analisar múltiplos backtests
export function analyzeMultipleBacktests(filePaths: string[]): {
  patterns: PatternAnalysis[];
  suggestions: MultipleSuggestion[];
  summary: {
    totalFiles: number;
    totalGames: number;
    totalMarkets: number;
    avgSuccessRate: number;
  };
} {
  const allResults: BacktestResult[] = [];
  
  // Carrega todos os arquivos
  for (const filePath of filePaths) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const backtest = JSON.parse(content);
      allResults.push(...backtest.results);
    } catch (error) {
      console.error(`Erro ao ler arquivo ${filePath}:`, error);
    }
  }
  
  // Análise de padrões
  const patterns = analyzePatterns(allResults);
  
  // Geração de sugestões
  const suggestions = generateSuggestions(allResults, patterns);
  
  return {
    patterns,
    suggestions,
    summary: {
      totalFiles: filePaths.length,
      totalGames: allResults.length,
      totalMarkets: allResults.reduce((acc, r) => acc + r.combo.length, 0),
      avgSuccessRate: patterns.reduce((acc, p) => acc + p.successRate, 0) / patterns.length || 0
    }
  };
}

function analyzePatterns(results: BacktestResult[]): PatternAnalysis[] {
  const patterns: Record<string, {
    total: number;
    wins: number;
    odds: number[];
    profits: number[];
    matches: string[];
  }> = {};
  
  // Agrupa por horário
  const gamesByHour = results.reduce((acc, result) => {
    const hour = result.hour?.split(' ')[1]?.split(':')[0] || 'unknown';
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push(result);
    return acc;
  }, {} as Record<string, BacktestResult[]>);
  
  // Analisa padrões específicos
  for (const [hour, games] of Object.entries(gamesByHour)) {
    if (games.length < 2) continue;
    
    // Padrão 1: Finalizações HT + Gols HT
    const htDoublePattern = games.filter(game => 
      game.combo.some(c => 
        c.label.includes('Finalizações HT') && 
        c.result === 'win'
      ) &&
      game.combo.some(c => 
        c.label.includes('Gols HT') && 
        c.result === 'win'
      )
    );
    
    if (htDoublePattern.length > 0) {
      const key = `HT_Double_${hour}`;
      if (!patterns[key]) {
        patterns[key] = { total: 0, wins: 0, odds: [], profits: [], matches: [] };
      }
      
      htDoublePattern.forEach(game => {
        const finalHT = game.combo.find(c => c.label.includes('Finalizações HT'));
        if (finalHT) {
          patterns[key].total++;
          if (finalHT.result === 'win') patterns[key].wins++;
          patterns[key].odds.push(finalHT.odd);
          patterns[key].profits.push(finalHT.profit);
          patterns[key].matches.push(game.match);
        }
      });
    }
    
    // Padrão 2: Cantos FT + Times Dominantes
    const cornerDominantPattern = games.filter(game =>
      game.combo.some(c => 
        c.label.includes('Cantos FT') && 
        c.result === 'win'
      ) &&
      (game.profile === 'dominant' || game.profile === 'high_offense_balanced')
    );
    
    if (cornerDominantPattern.length > 0) {
      const key = `Corner_Dominant_${hour}`;
      if (!patterns[key]) {
        patterns[key] = { total: 0, wins: 0, odds: [], profits: [], matches: [] };
      }
      
      cornerDominantPattern.forEach(game => {
        const corner = game.combo.find(c => c.label.includes('Cantos FT'));
        if (corner) {
          patterns[key].total++;
          if (corner.result === 'win') patterns[key].wins++;
          patterns[key].odds.push(corner.odd);
          patterns[key].profits.push(corner.profit);
          patterns[key].matches.push(game.match);
        }
      });
    }
    
    // Padrão 3: Favorito Vence + Over 1.5
    const favOverPattern = games.filter(game =>
      game.combo.some(c => 
        c.label.includes('Vence') && 
        c.label.includes('Over 1.5') && 
        c.result === 'win'
      )
    );
    
    if (favOverPattern.length > 0) {
      const key = `Fav_Over15_${hour}`;
      if (!patterns[key]) {
        patterns[key] = { total: 0, wins: 0, odds: [], profits: [], matches: [] };
      }
      
      favOverPattern.forEach(game => {
        const favOver = game.combo.find(c => 
          c.label.includes('Vence') && 
          c.label.includes('Over 1.5')
        );
        if (favOver) {
          patterns[key].total++;
          if (favOver.result === 'win') patterns[key].wins++;
          patterns[key].odds.push(favOver.odd);
          patterns[key].profits.push(favOver.profit);
          patterns[key].matches.push(game.match);
        }
      });
    }
    
    // Padrão 4: Over 2.5 + BTTS
    const overBttsPattern = games.filter(game =>
      game.combo.some(c => 
        c.label.includes('Over 2.5') && 
        c.label.includes('Ambas Marcam') && 
        c.result === 'win'
      )
    );
    
    if (overBttsPattern.length > 0) {
      const key = `Over25_BTTS_${hour}`;
      if (!patterns[key]) {
        patterns[key] = { total: 0, wins: 0, odds: [], profits: [], matches: [] };
      }
      
      overBttsPattern.forEach(game => {
        const overBtts = game.combo.find(c => 
          c.label.includes('Over 2.5') && 
          c.label.includes('Ambas Marcam')
        );
        if (overBtts) {
          patterns[key].total++;
          if (overBtts.result === 'win') patterns[key].wins++;
          patterns[key].odds.push(overBtts.odd);
          patterns[key].profits.push(overBtts.profit);
          patterns[key].matches.push(game.match);
        }
      });
    }
  }
  
  // Converte para PatternAnalysis
  return Object.entries(patterns).map(([pattern, data]) => ({
    pattern,
    totalOccurrences: data.total,
    successRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
    avgOdd: data.odds.length > 0 ? data.odds.reduce((a, b) => a + b, 0) / data.odds.length : 0,
    profit: data.profits.reduce((a, b) => a + b, 0),
    roi: data.total > 0 ? (data.profits.reduce((a, b) => a + b, 0) / data.total) * 100 : 0,
    matches: data.matches
  })).sort((a, b) => b.successRate - a.successRate);
}

function generateSuggestions(results: BacktestResult[], patterns: PatternAnalysis[]): MultipleSuggestion[] {
  const suggestions: MultipleSuggestion[] = [];
  
  // Agrupa jogos por horário para múltiplas
  const gamesByHour = results.reduce((acc, result) => {
    const hour = result.hour?.split(' ')[1]?.split(':')[0] || 'unknown';
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push(result);
    return acc;
  }, {} as Record<string, BacktestResult[]>);
  
  // Para cada horário, gera sugestões baseadas nos padrões
  for (const [hour, games] of Object.entries(gamesByHour)) {
    // Busca padrões bem-sucedidos para este horário
    const successfulPatterns = patterns.filter(p => 
      p.successRate >= 75 && 
      p.pattern.includes(hour) && 
      p.totalOccurrences >= 2
    );
    
    for (const pattern of successfulPatterns.slice(0, 3)) { // Top 3 padrões
      const selections = generateSelectionsFromPattern(games, pattern);
      
      if (selections.length >= 2 && selections.length <= 4) {
        const combinedOdd = selections.reduce((acc, s) => acc * s.odd, 1);
        const confidence = calculateConfidence(pattern, combinedOdd);
        const type = getMultipleType(selections.length, confidence);
        
        suggestions.push({
          id: `${pattern.pattern}_${Date.now()}_${Math.random()}`,
          type,
          confidence,
          expectedValue: calculateExpectedValue(pattern.successRate, combinedOdd),
          selections,
          combinedOdd,
          suggestedStake: calculateStake(confidence, type),
          expectedReturn: combinedOdd * calculateStake(confidence, type),
          historicalSuccessRate: pattern.successRate
        });
      }
    }
  }
  
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
}

function generateSelectionsFromPattern(games: BacktestResult[], pattern: PatternAnalysis) {
  const selections: any[] = [];
  
  if (pattern.pattern.includes('HT_Double')) {
    // Busca Finalizações HT e Gols HT
    for (const game of games) {
      if (selections.length >= 2) break;
      
      const finalHT = game.combo.find(c => 
        c.label.includes('Finalizações HT') && 
        c.result === 'win'
      );
      
      if (finalHT) {
        selections.push({
          match: game.match,
          league: game.league,
          hour: game.hour,
          market: finalHT.label,
          odd: finalHT.odd,
          reason: `Padrão HT ${pattern.successRate.toFixed(0)}%`
        });
      }
    }
    
    for (const game of games) {
      if (selections.length >= 2) break;
      
      const golsHT = game.combo.find(c => 
        c.label.includes('Gols HT') && 
        c.result === 'win'
      );
      
      if (golsHT) {
        selections.push({
          match: game.match,
          league: game.league,
          hour: game.hour,
          market: golsHT.label,
          odd: golsHT.odd,
          reason: `Padrão HT ${pattern.successRate.toFixed(0)}%`
        });
      }
    }
  }
  
  if (pattern.pattern.includes('Corner_Dominant')) {
    // Busca Cantos FT em jogos dominantes
    for (const game of games) {
      if (selections.length >= 2) break;
      
      const corner = game.combo.find(c => 
        c.label.includes('Cantos FT') && 
        c.result === 'win'
      );
      
      if (corner) {
        selections.push({
          match: game.match,
          league: game.league,
          hour: game.hour,
          market: corner.label,
          odd: corner.odd,
          reason: `Corner Dominante ${pattern.successRate.toFixed(0)}%`
        });
      }
    }
  }
  
  if (pattern.pattern.includes('Fav_Over15')) {
    // Busca Favorito Vence + Over 1.5
    for (const game of games) {
      if (selections.length >= 2) break;
      
      const favOver = game.combo.find(c => 
        c.label.includes('Vence') && 
        c.label.includes('Over 1.5') && 
        c.result === 'win'
      );
      
      if (favOver) {
        selections.push({
          match: game.match,
          league: game.league,
          hour: game.hour,
          market: favOver.label,
          odd: favOver.odd,
          reason: `Fav + Over ${pattern.successRate.toFixed(0)}%`
        });
      }
    }
  }
  
  if (pattern.pattern.includes('Over25_BTTS')) {
    // Busca Over 2.5 + BTTS
    for (const game of games) {
      if (selections.length >= 2) break;
      
      const overBtts = game.combo.find(c => 
        c.label.includes('Over 2.5') && 
        c.label.includes('Ambas Marcam') && 
        c.result === 'win'
      );
      
      if (overBtts) {
        selections.push({
          match: game.match,
          league: game.league,
          hour: game.hour,
          market: overBtts.label,
          odd: overBtts.odd,
          reason: `Over 2.5 + BTTS ${pattern.successRate.toFixed(0)}%`
        });
      }
    }
  }
  
  return selections;
}

function calculateConfidence(pattern: PatternAnalysis, combinedOdd: number): number {
  const baseConfidence = pattern.successRate / 100;
  const oddPenalty = Math.max(0, (combinedOdd - 2) * 0.05); // Penalidade para odds altas
  const volumeBonus = Math.min(0.1, pattern.totalOccurrences * 0.02); // Bônus por volume
  
  return Math.max(0, Math.min(1, baseConfidence + volumeBonus - oddPenalty));
}

function getMultipleType(selections: number, confidence: number): "bingoSeguro" | "bingoAlavanc" {
  // 🆕 Nova classificação para bilhetes Bingo
  if (selections <= 4 && confidence >= 0.75) return "bingoSeguro";
  return "bingoAlavanc";
}

function calculateExpectedValue(successRate: number, combinedOdd: number): number {
  const winProbability = successRate / 100;
  return (winProbability * combinedOdd) - 1;
}

function calculateStake(confidence: number, type: "bingoSeguro" | "bingoAlavanc"): number {
  const baseStake = type === "bingoSeguro" ? 3 : 1.5; // 🆕 Novos stakes para Bingo
  return Math.max(0.5, baseStake * confidence);
}

// Função principal para executar a análise
export function runMultipleAnalysis(filePaths: string[]) {
  console.log("🎯 Iniciando análise de múltiplas...");
  console.log(`📁 Arquivos: ${filePaths.join(', ')}`);
  
  const analysis = analyzeMultipleBacktests(filePaths);
  
  console.log("\n📊 RESUMO DA ANÁLISE:");
  console.log(`• Total de arquivos: ${analysis.summary.totalFiles}`);
  console.log(`• Total de jogos: ${analysis.summary.totalGames}`);
  console.log(`• Total de mercados: ${analysis.summary.totalMarkets}`);
  console.log(`• Taxa de sucesso média: ${analysis.summary.avgSuccessRate.toFixed(1)}%`);
  
  console.log("\n🔍 PADRÕES IDENTIFICADOS:");
  analysis.patterns.slice(0, 10).forEach((pattern, idx) => {
    console.log(`${idx + 1}. ${pattern.pattern.replace(/_/g, ' ')}`);
    console.log(`   • Ocorrências: ${pattern.totalOccurrences}`);
    console.log(`   • Taxa de sucesso: ${pattern.successRate.toFixed(1)}%`);
    console.log(`   • ROI: ${pattern.roi.toFixed(1)}%`);
    console.log(`   • Odd média: ${pattern.avgOdd.toFixed(2)}`);
    console.log(`   • Exemplos: ${pattern.matches.slice(0, 2).join(', ')}`);
    console.log("");
  });
  
  console.log("🎯 SUGESTÕES DE MÚLTIPLAS:");
  analysis.suggestions.slice(0, 10).forEach((suggestion, idx) => {
    console.log(`${idx + 1}. [${suggestion.type.toUpperCase()}] ${(suggestion.confidence * 100).toFixed(1)}% confiança`);
    console.log(`   • Odd combinada: ${suggestion.combinedOdd.toFixed(2)}`);
    console.log(`   • Stake sugerido: ${suggestion.suggestedStake.toFixed(1)}u`);
    console.log(`   • Retorno esperado: ${suggestion.expectedReturn.toFixed(2)}u`);
    console.log(`   • Valor esperado: ${(suggestion.expectedValue * 100).toFixed(1)}%`);
    console.log(`   • Taxa histórica: ${suggestion.historicalSuccessRate.toFixed(1)}%`);
    console.log("   • Seleções:");
    suggestion.selections.forEach((sel, sidx) => {
      console.log(`     ${sidx + 1}. ${sel.market}`);
      console.log(`        ${sel.match} (Odd: ${sel.odd.toFixed(2)})`);
      console.log(`        Motivo: ${sel.reason}`);
    });
    console.log("");
  });
  
  return analysis;
}
