/**
 * Diagnóstico: verifica que o engine gera mercados de cantos (escanteios)
 * para jogos com dados favoráveis de cantos.
 */
import { suggestCombo, suggestMainMarket, classifyProfile, getFavorito, computeScore } from '../../engine';

// Mock game: perfil chutes_ht_fav com bons dados de cantos
const mockGameChutesFav = {
  id: 99,
  home: 'TeamA', away: 'TeamB',
  match: 'TeamA x TeamB',
  league: 'Premier League',
  hour: '15:00',
  status: 'NS',
  exG: 3.2, exC: 9.5,
  cv: 35, cvCantos: 38, cvCantosHT: 42,
  afH: 78, afA: 45, af: { h: 78, a: 45 },
  chHTH: 5.5, chHTA: 2.1,
  chTotH: 8, chTotA: 4,
  cantHTH: 4.2, cantHTA: 2.1,
  cantFTH: 7, cantFTA: 4,
  gol05HTH: 72, gol05HTA: 55,
  dfH: 60, dfA: 28,
  golsSofH: 1.2, golsSofA: 1.8,
  favoritismo: 80,
  golsHTH: 1.1, golsHTA: 0.6,
  golsHTSofH: 0.5, golsHTSofA: 0.9,
  btsPctH: 45, btsPctA: 55,
  classH: 3, classA: 12,
  ppgH: 2.1, ppgA: 1.0,
  cantos37HTH: 0.35, cantos37HTA: 0.15,
  asPrecisaoH: 42, asPrecisaoA: 30,
  appgH: 0.95, appgA: 0.60,
  percMais4EscanteiosHT: 58, percMais5EscanteiosHT: 42,
  percMais25Gols: 70,
  mediaEscanteios0a10: 1.2, mediaEscanteios11a20: 1.5,
  mediaEscanteios21a30: 1.8, mediaEscanteios31a40: 2.0,
  resultHome: null, resultAway: null,
  odds: {},
  _miss: { exG: false, exC: false, cv: false, af: false, classificacao: false, pontosPorJogo: false },
};

// Mock game: corner_heavy profile (exC >= 9, exG < 3)
const mockGameCornerHeavy = {
  ...mockGameChutesFav,
  id: 100,
  exG: 2.8, exC: 10.5,
  afH: 55, afA: 48, af: { h: 55, a: 48 },
  chHTH: 3.0, chHTA: 2.5,
  cantHTH: 5.0, cantHTA: 3.5,
};

// Mock game: with APPG = 0 (simulating column 47 empty)
const mockGameNoAppg = {
  ...mockGameChutesFav,
  id: 101,
  appgH: 0, appgA: 0,
};

describe('Cantos Market Generation', () => {

  test('Game with chutes_ht_fav profile + good corners → should include cantos in combo via diversification', () => {
    const profile = classifyProfile(mockGameChutesFav);
    console.log('[TEST-1] Profile:', profile);
    
    const fav = getFavorito(mockGameChutesFav);
    console.log('[TEST-1] cantFavHT:', fav.cantFavHT, 'exC:', mockGameChutesFav.exC, 'cvCantosHT:', mockGameChutesFav.cvCantosHT);
    
    const combo = suggestCombo(mockGameChutesFav);
    console.log('[TEST-1] Combo labels:', combo.map((c: any) => c.label));
    
    const hasCantos = combo.some((c: any) => 
      c.label.toLowerCase().includes('canto') || c.label.toLowerCase().includes('escanteio')
    );
    
    expect(hasCantos).toBe(true);
  });

  test('Game with corner_heavy profile → should include cantos as main or combo', () => {
    const profile = classifyProfile(mockGameCornerHeavy);
    console.log('[TEST-2] Profile:', profile);
    
    const main = suggestMainMarket(mockGameCornerHeavy);
    console.log('[TEST-2] Main market:', main?.label, 'axis:', main?.axis);
    
    const combo = suggestCombo(mockGameCornerHeavy);
    console.log('[TEST-2] Combo labels:', combo.map((c: any) => c.label));
    
    const hasCantos = 
      (main?.axis === 'cantos' || main?.axis === 'cantos_ht') ||
      combo.some((c: any) => 
        c.label.toLowerCase().includes('canto') || c.label.toLowerCase().includes('escanteio')
      );
    
    expect(hasCantos).toBe(true);
  });

  test('Game with APPG=0 → diversification should still generate cantos (APPG is for finalizações, not cantos)', () => {
    const profile = classifyProfile(mockGameNoAppg);
    console.log('[TEST-3] Profile:', profile);
    
    const fav = getFavorito(mockGameNoAppg);
    console.log('[TEST-3] cantFavHT:', fav.cantFavHT, 'exC:', mockGameNoAppg.exC);
    
    const combo = suggestCombo(mockGameNoAppg);
    console.log('[TEST-3] Combo labels:', combo.map((c: any) => c.label));
    
    const hasCantos = combo.some((c: any) => 
      c.label.toLowerCase().includes('canto') || c.label.toLowerCase().includes('escanteio')
    );
    
    // With APPG=0, the diversification block should still fire since it doesn't require APPG
    expect(hasCantos).toBe(true);
  });

  test('Score gate: game must pass score >= 0.50 to have any suggestions', () => {
    const score = computeScore(mockGameChutesFav);
    console.log('[TEST-4] Score:', score);
    expect(typeof score === 'number' ? score : score?.score || 0).toBeGreaterThanOrEqual(0.50);
  });
});
