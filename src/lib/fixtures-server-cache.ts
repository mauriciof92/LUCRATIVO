// src/lib/fixtures-server-cache.ts
// Cache server-side em memória + arquivo — sobrevive entre requests na mesma sessão

import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), '.fixtures-cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

interface ServerCache {
  date: string;
  csvHash: string; // Hash dos times para invalidar quando CSV mudar
  fetchedAt: number;
  fixtures: Array<{ fixtureId: number; homeTeam: string; awayTeam: string; league: string; date: string }>;
  oddsMap: Record<number, any>;
}

// Cache em memória (mais rápido, reset no restart do servidor)
let memCache: ServerCache | null = null;

// Gerar hash simples dos times do CSV para chave de cache
export function generateCsvHash(csvGames: any[]): string {
  const teams = csvGames.map(g => `${g.home || ''}x${g.away || ''}`).sort().join(',');
  return Buffer.from(teams).toString('base64').slice(0, 16);
}

export function loadServerCache(date: string, csvGames: any[]): ServerCache | null {
  const csvHash = generateCsvHash(csvGames);
  
  // 1. Tentar memória primeiro
  if (memCache && memCache.date === date && memCache.csvHash === csvHash && Date.now() - memCache.fetchedAt < CACHE_TTL_MS) {
    console.log(`[SERVER-CACHE] Hit memória para ${date} (hash: ${csvHash})`);
    return memCache;
  }
  
  // 2. Tentar arquivo
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cache: ServerCache = JSON.parse(raw);
      if (cache.date === date && cache.csvHash === csvHash && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        console.log(`[SERVER-CACHE] Hit arquivo para ${date} (hash: ${csvHash}) - ${Math.floor((Date.now() - cache.fetchedAt)/60000)}min atrás`);
        memCache = cache;
        return cache;
      }
    }
  } catch (e) {
    console.warn('[SERVER-CACHE] Erro ao ler arquivo:', e);
  }
  
  console.log(`[SERVER-CACHE] Miss para ${date} (hash: ${csvHash})`);
  return null;
}

export function saveServerCache(date: string, csvGames: any[], fixtures: any[], oddsMap: Record<number, any>): void {
  const csvHash = generateCsvHash(csvGames);
  const data: ServerCache = {
    date,
    csvHash,
    fetchedAt: Date.now(),
    fixtures,
    oddsMap,
  };
  
  memCache = data;
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
    console.log(`[SERVER-CACHE] Salvo: ${fixtures.length} fixtures, ${Object.keys(oddsMap).length} com odds (hash: ${csvHash})`);
  } catch (e) {
    console.warn('[SERVER-CACHE] Erro ao salvar arquivo:', e);
  }
}

export function clearServerCache(): void {
  memCache = null;
  try { 
    fs.unlinkSync(CACHE_FILE); 
    console.log('[SERVER-CACHE] Cache limpo manualmente');
  } catch {}
}
