// src/lib/odds-cache.ts
// Cache inteligente de odds com TTL de 2 horas

const CACHE_KEY = 'lucrativo-odds-cache';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

export interface OddsCache {
  fetchedAt: number;
  odds: Record<number, any>;       // fixtureId → odds
  matched: Array<{
    csvKey: string;                // "HomeTeam x AwayTeam"
    fixtureId: number;
    confidence: number;
  }>;
}

export function saveOddsCache(data: Omit<OddsCache, 'fetchedAt'>): void {
  const entry: OddsCache = { ...data, fetchedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  console.log(`[CACHE] Odds cache salvo com ${Object.keys(data.odds).length} fixtures`);
}

export function loadOddsCache(): OddsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: OddsCache = JSON.parse(raw);
    
    // Verificar TTL
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
      console.log(`[CACHE] Cache expirado (${Math.floor((Date.now() - cache.fetchedAt) / 60000)}min > 120min)`);
      return null;
    }
    
    console.log(`[CACHE] Cache válido carregado (${Math.floor((Date.now() - cache.fetchedAt) / 60000)}min atrás)`);
    return cache;
  } catch (error) {
    console.error('[CACHE] Erro ao carregar cache:', error);
    return null;
  }
}

export function getOddsAge(cache: OddsCache): {
  ageMinutes: number;
  indicator: '🟢' | '🟡' | '🔴';
  label: string;
} {
  const ageMs = Date.now() - cache.fetchedAt;
  const ageMinutes = Math.floor(ageMs / 60000);
  
  return {
    ageMinutes,
    indicator: ageMinutes < 60 ? '🟢' : ageMinutes < 180 ? '🟡' : '🔴',
    label: ageMinutes < 60
      ? `${ageMinutes}min atrás` 
      : `${Math.floor(ageMinutes/60)}h atrás`,
  };
}

export function clearOddsCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('[CACHE] Cache limpo manualmente');
}
