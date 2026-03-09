// Camada 2 - Mapper: BetResult existente → DecisionGame (Mapa de Decisão v1)
// Usa somente campos já existentes, sem cálculos sofisticados

import { DecisionGame } from '../types/decision-game';

// Interface para BetResult (campos existentes)
interface BetResult {
  match: string;
  league: string;
  hour: string;
  status: string;
  profile: string;
  score: number;
  confidence: number;
  mainMarket: {
    label: string;
    odd: number | null;
    minOdd: number | null;
    source?: 'csv' | 'api-real' | 'estimated' | null;
    stake: number;
    result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual";
    profit: number;
    hasValue: boolean;
    isManual?: boolean;
  };
  combo: Array<{
    label: string;
    odd: number | null;
    minOdd: number | null;
    source?: 'csv' | 'api-real' | 'estimated' | null;
    stake: number;
    result: "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual";
    profit: number;
    hasValue: boolean;
    isManual?: boolean;
  }>;
  favorito: any; // ReturnType<typeof getFavorito> - objeto complexo
  poison?: {
    isPoison: boolean;
    triggers: Array<{ level: number; icon: string; tag: string; color: string; glow: string; reason: string }>;
    highestLevel: number;
    primaryTrigger: { level: number; icon: string; tag: string; color: string; glow: string; reason: string } | null;
  };
}

// Mapper principal - regra simples e explícita
export function mapToDecisionGame(betResult: BetResult, index: number): DecisionGame {
  // Extrair times do match - regra explícita
  const teams = betResult.match.split(' x ');
  
  // 🆕 Mapear dominantReading principalmente de mainMarket.label
  const dominantReading = mapDominantReadingFromMarket(betResult.mainMarket.label, betResult.profile);
  
  // Mapear readings - só usa campos existentes, sem inventar
  const readings = {
    goals: mapGoalsFromProfile(betResult.profile, betResult.score),
    btts: mapBTTSFromCombo(betResult.combo, betResult.score),
    corners: 0, // placeholder - futuro enriquecimento
    htPressure: 0, // placeholder - futuro enriquecimento
    shots: 0, // placeholder - futuro enriquecimento
    harmony: 0, // placeholder - futuro enriquecimento
    favoritism: mapFavoritism(betResult.favorito),
    offensive: mapOffensive(betResult.score)
  };
  
  // Mapear mainMarket existente - sem alteração
  const mainMarket = {
    market: betResult.mainMarket.label || '',
    odd: betResult.mainMarket.odd || 0,
    edge: 0, // placeholder - campo não existe no BetResult real
    confidence: betResult.confidence,
    result: betResult.mainMarket.result || 'pending_manual',
    profit: betResult.mainMarket.profit || 0
  };
  
  // Mapear mercados secundários - só se existir combo
  const secondaryMarkets = betResult.combo && betResult.combo.length > 0 ? betResult.combo.map(c => ({
    market: c.label,
    odd: c.odd || 0,
    edge: 0, // placeholder - campo não existe no combo real
    reason: 'Combo existente'
  })) : [];
  
  // ProductFit inicial conservador - só usa thresholds existentes
  const productFit = {
    single: betResult.score >= 45 && betResult.confidence >= 35,
    multiple: betResult.score >= 40 && betResult.confidence >= 30,
    bingo: betResult.score >= 60 && betResult.confidence >= 50,
    shots: false, // placeholder
    harmony: false // placeholder
  };
  
  // Explicação curta e legível - enriquecida com profile
  const explanationShort = generateExplanationWithProfile(dominantReading, mainMarket.market, betResult.profile);
  
  return {
    gameId: `game-${index}`,
    context: {
      match: betResult.match,
      league: betResult.league,
      hour: betResult.hour,
      status: betResult.status,
      home: teams[0] || '',
      away: teams[1] || ''
    },
    readings,
    dominantReading,
    mainMarket,
    secondaryMarkets,
    productFit,
    explanationShort,
    debugMeta: {
      originalScore: betResult.score,
      originalConfidence: betResult.confidence,
      originalProfile: betResult.profile,
      poison: betResult.poison?.isPoison || false,
      favorito: betResult.favorito?.lado || false,
      mappingRules: ['profile-to-readings', 'score-to-offensive', 'favorito-to-favoritism']
    }
  };
}

// 🆕 Mapear dominantReading principalmente de mainMarket.label
function mapDominantReadingFromMarket(marketLabel: string, profile: string): string {
  const label = marketLabel.toLowerCase();
  
  // Mapeamento principal baseado no mercado
  if (label.includes('over 1.5') || label.includes('over 2.5')) {
    return 'goals';
  }
  if (label.includes('ambas') || label.includes('btts') || label.includes('ambas marcam')) {
    return 'btts';
  }
  if (label.includes('cantos') || label.includes('corners')) {
    return 'corners';
  }
  if (label.includes('ht') || label.includes('primeiro tempo')) {
    return 'htPressure';
  }
  if (label.includes('finaliza') || label.includes('shots')) {
    return 'shots';
  }
  if (label.includes('ofensiv') || label.includes('combo')) {
    return 'offensive';
  }
  
  // Fallback: usar profile como refinador
  if (profile.toLowerCase().includes('ofensivo') || profile.toLowerCase().includes('gol')) {
    return 'goals';
  }
  
  return 'unknown';
}

// Helpers - regras simples, sem cálculos sofisticados
function mapGoalsFromProfile(profile: string, score: number): number {
  // Regra explícita: profiles que indicam gols
  const goalProfiles = ['ofensivo', 'gol', 'ataque', 'goals'];
  const hasGoalProfile = goalProfiles.some(p => 
    profile.toLowerCase().includes(p.toLowerCase())
  );
  return hasGoalProfile ? Math.min(80, score + 20) : score * 0.7;
}

function mapBTTSFromCombo(combo: any[], score: number): number {
  // Regra explícita: se tem combo BTTS, aumenta nota
  const hasBTTS = combo && combo.some(c => c.label.toLowerCase().includes('btts'));
  return hasBTTS ? Math.min(75, score + 15) : score * 0.6;
}

function mapFavoritism(favorito: any): number {
  // Regra explícita: se favorito tem lado, é favorito = 60, senão = 40
  return favorito?.lado ? 60 : 40;
}

function mapOffensive(score: number): number {
  // Regra explícita: offensive = score * 1.2 (limitado a 90)
  return Math.min(90, score * 1.2);
}

function getDominantReading(readings: any): string {
  // Regra simples: maior valor numérico vence
  const entries = Object.entries(readings);
  const [dominant] = entries.sort(([,a], [,b]) => (b as number) - (a as number));
  return dominant[0];
}

function generateExplanationWithProfile(dominantReading: string, market: string, profile: string): string {
  // Explicação curta e legível - enriquecida com profile como refinador
  return `Leitura: ${dominantReading} | Mercado: ${market} | Perfil: ${profile}`;
}

function generateExplanation(dominantReading: string, market: string, profile: string): string {
  // Explicação curta e legível
  return `Leitura: ${dominantReading} | Mercado: ${market} | Perfil: ${profile}`;
}
