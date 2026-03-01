'use client';

import { useState, useMemo, useEffect } from 'react';
import { useBacktest } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';
import { PreLiveMultipleAnalyzer } from '../../lib/pre-live-multiple-analyzer';
import type { PreMatchOdds } from '../../lib/footballApi';
import { C, KPI, EmptyState, ProfileBadge } from '../../components/ui';

// Importar poissonProb para cálculo dinâmico
function poissonProb(lambda: number, k: number): number {
  // P(X > k) = probabilidade de superar a linha k
  let cdf = 0;
  for (let i = 0; i <= Math.floor(k); i++) {
    cdf += (Math.exp(-lambda) * Math.pow(lambda, i)) / factorial(i);
  }
  return 1 - cdf;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

const TICKET_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  bronze:    { label: 'Seguro',    color: '#58a6ff', icon: '🛡️' },
  silver:    { label: 'Padrão',    color: '#c0c0c0', icon: '⚖️' },
  gold:      { label: 'Forte',     color: '#ffd700', icon: '💪' },
  agressivo: { label: 'Agressivo', color: '#ff6b00', icon: '🚀' },
  bingo:     { label: 'Bingo',     color: '#ff1744', icon: '💣' },
  sinfonia:  { label: 'Sinfonia',  color: '#00e676', icon: '🐦' },
  ftbox:     { label: 'Box FT',    color: '#ff9800', icon: '🔥' },
};

export default function MultipleAnalyzerPage() {
  const { results, todayGames, lastCsvText } = useBacktest();
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [odds, setOdds] = useState<Record<number, PreMatchOdds>>({});
  const [unmatchedGames, setUnmatchedGames] = useState<any[]>([]);
  const [showUnmatchedDetails, setShowUnmatchedDetails] = useState(false);
  const [ignoredMatches, setIgnoredMatches] = useState<string[]>([]);

  // 🆕 Estados para FT Box Personalizado
  const [showFTBoxBuilder, setShowFTBoxBuilder] = useState(false);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());

  // 🆕 FORÇAR EXECUÇÃO DO TESTE DE ODDS (DESATIVADO)
  useEffect(() => {
    // Temporariamente desativado para não poluir console
    // async function testOdds() {
    //   // Temporário — só para ver se a API tem os mercados
    //   const KEY = '70c968a10d5fb42058742e546b268f3d'; // hardcode temporário
      
    //   const res = await fetch(
    //     `https://v3.football.api-sports.io/odds?fixture=1378126&bookmaker=8`,
    //     { headers: { 'x-apisports-key': KEY } }
    //   );
    //   const data = await res.json();
    //   const bets = data.response?.[0]?.bookmakers?.[0]?.bets || [];
    //   console.log(`[ODDS-TEST] Total mercados: ${bets.length}`);
    //   bets.forEach((bet: any) => {
    //     console.log(`  [bet.id=${bet.id}] ${bet.name}`);
    //     bet.values?.slice(0, 3).forEach((v: any) => {
    //       console.log(`    → ${v.value}: ${v.odd}`);
    //     });
    //   });
    // };
    // testOdds();
  }, []); // roda UMA vez ao montar
  
  const [customFTBox, setCustomFTBox] = useState<any>(null);
  const [ftBoxCandidates, setFtBoxCandidates] = useState<any[]>([]);

  const analyzer = useMemo(() => new PreLiveMultipleAnalyzer(), []);

  // Usar dados do hook
  const games = todayGames.length > 0 ? todayGames : results;
  // Usar CSV original preservado pelo hook (fallback: localStorage)
  const csvText = useMemo(() => {
    if (lastCsvText) return lastCsvText;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lucrativo-last-csv') ?? '';
    }
    return '';
  }, [lastCsvText]);

  const handleAnalyze = async () => {
    const text = csvText.trim();
    if (!text.trim()) {
      setError('Por favor, cole o CSV do dia');
      return; 
    }
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzer.analyzeLiveMultiples(text, undefined, undefined, ignoredMatches);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
      // 🆕 Guardar ftBoxCandidates para o construtor manual
      setFtBoxCandidates(result.ftBoxCandidates ?? []);
      if ((result.suggestions ?? []).length === 0) {
        setError(`Nenhuma múltipla gerada. ${result.summary.totalGames} jogos no banco, ${result.summary.qualityGames} com qualidade suficiente (score≥65%, conf≥55%). Cada perna precisa de odd entre 1.20–2.50.`);
      }
    } catch (e: any) {
      setError('Erro ao analisar: ' + (e?.message ?? String(e)));
    } finally {
      setAnalyzing(false);
    }
  };

  // 🆕 Gerar Box FT Personalizado
  const handleGenerateCustomFTBox = async () => {
    if (selectedGames.size < 2) {
      setError('Selecione pelo menos 2 jogos para o Box FT.');
      return;
    }

    const selectedGamesData = games.filter((g: any) => 
      selectedGames.has(g.match || `${g.home} x ${g.away}`)
    );

    const selectedMarketsData = Array.from(selectedMarkets).map(marketKey => {
      const [gameMatch, marketType] = marketKey.split('|');
      const game = selectedGamesData.find((g: any) => 
        (g.match || `${g.home} x ${g.away}`) === gameMatch
      );
      return { game, marketType };
    }).filter(m => m.game);

    try {
      const customBox = await analyzer.buildCustomFTBox(selectedGamesData, selectedMarketsData);
      if (customBox) {
        setCustomFTBox(customBox);
        setError('');
      } else {
        setError('Não foi possível gerar o Box FT com as seleções atuais.');
      }
    } catch (e: any) {
      setError('Erro ao gerar Box FT: ' + (e?.message ?? String(e)));
    }
  };

  // 🆕 Obter mercados FT disponíveis para um jogo (com odds reais)
  const getFTMarketsForGame = async (game: any) => {
    const fav = (analyzer as any).getFavorito?.(game);
    if (!fav) return [];

    const markets = [];

    // 🆕 BUSCAR ODDS REAIS DA API
    let realOdds: { cornersLines: any[], shotsLines: any[] } = { cornersLines: [], shotsLines: [] };
    if (game.apiFixtureId) {
      realOdds = await (analyzer as any).fetchRealOdds(game.apiFixtureId);
    }

    // CHUTES FT — linha dinâmica
    if (fav.chFavGol >= 4.0) {
      const lambda = fav.chFavGol * 1.8;
      const linhasChutes = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5];
      
      // Encontrar linha mais alta com prob entre 70-82%
      let bestThreshold = null;
      for (const linha of [...linhasChutes].reverse()) {
        const prob = poissonProb(lambda, linha);
        if (prob >= 0.70 && prob <= 0.82) {
          bestThreshold = { linha, prob };
          break;
        }
      }
      
      if (bestThreshold) {
        let odd = 1.70; // fallback
        let oddsSource = 'fallback';
        
        // 🆕 Tentar usar odds reais
        if (realOdds.shotsLines.length > 0) {
          const closestLine = realOdds.shotsLines.reduce((closest: any, current: any) => {
            const currentDiff = Math.abs(current.line - bestThreshold.linha);
            const closestDiff = Math.abs(closest.line - bestThreshold.linha);
            return currentDiff < closestDiff ? current : closest;
          });
          
          if (Math.abs(closestLine.line - bestThreshold.linha) <= 1.5) {
            odd = closestLine.odd;
            oddsSource = 'api-real';
          }
        }
        
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|chutes_ft`,
          label: `${fav.nome} — Over ${bestThreshold.linha} Chutes FT`,
          axis: 'chutes_ft',
          odd: odd,
          source: oddsSource,
        });
      } else {
        // Fallback se nenhuma linha atingir 70-82%
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|chutes_ft`,
          label: `${fav.nome} — Over 9.5 Chutes FT`,
          axis: 'chutes_ft',
          odd: 1.70,
          source: 'fallback',
        });
      }
    }

    // CANTOS FT — linha dinâmica
    if (fav.cantFavHT >= 3.0) {
      const lambda = fav.cantFavHT * 1.6;
      const linhasCantos = [3.5, 4.5, 5.5, 6.5];
      
      let bestThreshold = null;
      for (const linha of [...linhasCantos].reverse()) {
        const prob = poissonProb(lambda, linha);
        if (prob >= 0.70 && prob <= 0.82) {
          bestThreshold = { linha, prob };
          break;
        }
      }
      
      if (bestThreshold) {
        let odd = 1.85; // fallback
        let oddsSource = 'fallback';
        
        // 🆕 Tentar usar odds reais
        if (realOdds.cornersLines.length > 0) {
          const closestLine = realOdds.cornersLines.reduce((closest: any, current: any) => {
            const currentDiff = Math.abs(current.line - bestThreshold.linha);
            const closestDiff = Math.abs(closest.line - bestThreshold.linha);
            return currentDiff < closestDiff ? current : closest;
          });
          
          if (Math.abs(closestLine.line - bestThreshold.linha) <= 1.0) {
            odd = closestLine.odd;
            oddsSource = 'api-real';
          }
        }
        
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|cantos_ft`,
          label: `${fav.nome} — Over ${bestThreshold.linha} Cantos FT`,
          axis: 'cantos_ft',
          odd: odd,
          source: oddsSource,
        });
      } else {
        // Fallback se nenhuma linha atingir 70-82%
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|cantos_ft`,
          label: `${fav.nome} — Over 3.5 Cantos FT`,
          axis: 'cantos_ft',
          odd: 1.85,
          source: 'fallback',
        });
      }
    }

    return markets;
  };

  const handleFetchOdds = async () => {
    if (suggestions.length === 0) return;
    setLoadingOdds(true);
    setError('');
    try {
      // API key é lida server-side pelo route handler (process.env.FOOTBALL_API_KEY)
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/football-odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, date: today }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const result = await res.json();

      setOdds(result.oddsMap ?? {});
      setUnmatchedGames(result.unmatched ?? []);

      // Re-analisar com odds injetadas
      if (result.oddsMap && result.fixtureMap) {
        analyzer.injectRealOdds(result.oddsMap, result.fixtureMap);
        const enriched = await analyzer.analyzeLiveMultiples(csvText, result.oddsMap, result.fixtureMap, ignoredMatches);
        setSuggestions(enriched.suggestions);
      }

      if ((result.unmatched ?? []).length > 0) {
        setShowUnmatchedDetails(true);
      }
    } catch (e: any) {
      setError('Erro ao buscar odds: ' + (e?.message ?? String(e)));
    } finally {
      setLoadingOdds(false);
    }
  };

  // Handler: Ignorar jogo e regerar bilhetes (efeito roleta — só na sessão)
  const regenerateTickets = async (updated: string[]) => {
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = await analyzer.analyzeLiveMultiples(text, undefined, undefined, updated);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
    } catch (e) {
      console.error('Erro ao regerar bilhetes:', e);
    }
  };

  const handleIgnoreMatch = (matchName: string) => {
    const updated = [...ignoredMatches, matchName];
    setIgnoredMatches(updated);
    regenerateTickets(updated);
  };

  const handleIgnoreMatchClick = (matchName: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    handleIgnoreMatch(matchName);
  };

  // 🔄 Handler: Limpar todos os jogos ignorados e regerar
  const handleClearIgnored = async () => {
    setIgnoredMatches([]);
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = await analyzer.analyzeLiveMultiples(text);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
    } catch (e) {
      console.error('Erro ao regerar bilhetes:', e);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui,sans-serif' }}>
      <NavHeader activePage="/multiple-analyzer" />

      <div style={{ padding: '40px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🎫 Bilhetes do Dia</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>
            Múltiplas geradas automaticamente a partir dos jogos processados
          </p>
        </div>

        {/* STATUS DOS DADOS */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>📊 Status dos Dados</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Total de Jogos</div>
              <div style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>{games.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Jogos Hoje</div>
              <div style={{ color: C.blue, fontSize: 20, fontWeight: 700 }}>{todayGames.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Múltiplas Geradas</div>
              <div style={{ color: C.green, fontSize: 20, fontWeight: 700 }}>{suggestions.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Box FT Personalizado</div>
              <div style={{ color: customFTBox ? C.green : C.muted, fontSize: 20, fontWeight: 700 }}>
                {customFTBox ? '✅' : '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !csvText ? true : false}
              style={{
                background: analyzing ? C.muted : C.blue,
                color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer',
              }}
            >
              {analyzing ? '⏳ Analisando...' : '🔍 Analisar Múltiplas'}
            </button>

            <button
              onClick={() => setShowFTBoxBuilder(!showFTBoxBuilder)}
              disabled={false}
              style={{
                background: showFTBoxBuilder ? C.gold : C.surface,
                color: showFTBoxBuilder ? 'white' : C.text,
                border: `1px solid ${C.gold}`,
                borderRadius: 6, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              🔥 Box FT Personalizado
            </button>

            {suggestions.length > 0 && (
              <button
                onClick={handleFetchOdds}
                disabled={loadingOdds ? true : false}
                style={{
                  background: loadingOdds ? C.muted : C.green,
                  color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px',
                  fontSize: 13, fontWeight: 600, cursor: loadingOdds ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingOdds ? '⏳ Buscando odds...' : '💰 Odds Reais'}
              </button>
            )}

            {ignoredMatches.length > 0 && (
              <button
                onClick={handleClearIgnored}
                style={{
                  background: 'transparent', border: `1px solid ${C.muted}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  color: C.muted, cursor: 'pointer',
                }}
              >
                🔄 Restaurar {ignoredMatches.length} jogo(s)
              </button>
            )}
          </div>
        </div>

        {/* 🆕 FT BOX BUILDER */}
        {showFTBoxBuilder && (
          <div style={{ background: C.surface, border: `2px solid ${C.gold}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: C.gold }}>
              🔥 Construtor de Box FT Personalizado
            </h2>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>
              Selecione 2-3 jogos e seus mercados FT. Este box ignora conflitos com outras múltiplas.
            </p>

            <div style={{ display: 'grid', gap: 16, maxHeight: 400, overflowY: 'auto' }}>
              {ftBoxCandidates.map((candidate: any, candidateIndex: number) => {
                const game = candidate.game;
                const gameKey = game.match || `${game.home} x ${game.away}`;
                const isSelected = selectedGames.has(gameKey);
                const ftMarkets = candidate.markets || [];

                if (ftMarkets.length === 0) return null;

                return (
                  <div key={`ftbox-candidate-${candidateIndex}-${gameKey}`} style={{
                    background: isSelected ? `${C.gold}20` : 'transparent',
                    border: `1px solid ${isSelected ? C.gold : C.border}`,
                    borderRadius: 8, padding: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newSelected = new Set(selectedGames);
                          if (e.target.checked) {
                            newSelected.add(gameKey);
                          } else {
                            newSelected.delete(gameKey);
                            // Remover mercados deste jogo
                            const marketsToRemove = Array.from(selectedMarkets).filter(m => m.startsWith(gameKey + '|'));
                            marketsToRemove.forEach(m => selectedMarkets.delete(m));
                          }
                          setSelectedGames(newSelected);
                        }}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{gameKey}</span>
                    </div>

                    {isSelected && (
                      <div style={{ marginLeft: 24, display: 'grid', gap: 6 }}>
                        {ftMarkets.map((market: any, marketIndex: number) => {
                          const isMarketSelected = selectedMarkets.has(market.key);
                          const axisConflict = Array.from(selectedMarkets).some(m => {
                            if (m === market.key) return false;
                            const [, axis] = m.split('|');
                            return axis === market.axis;
                          });

                          return (
                            <div key={market.key} style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isMarketSelected}
                                disabled={axisConflict && !isMarketSelected ? true : false}
                                onChange={(e) => {
                                  const newMarkets = new Set(selectedMarkets);
                                  if (e.target.checked) {
                                    // Remover outro mercado do mesmo eixo
                                    const toRemove = Array.from(newMarkets).find(m => {
                                      const [, axis] = m.split('|');
                                      return axis === market.axis;
                                    });
                                    if (toRemove) newMarkets.delete(toRemove);
                                    newMarkets.add(market.key);
                                  } else {
                                    newMarkets.delete(market.key);
                                  }
                                  setSelectedMarkets(newMarkets);
                                }}
                                style={{ marginRight: 8, width: 14, height: 14 }}
                              />
                              <span style={{
                                fontSize: 12,
                                color: axisConflict && !isMarketSelected ? C.muted : C.text,
                                textDecoration: axisConflict && !isMarketSelected ? 'line-through' : 'none'
                              }}>
                                {market.label} @ {market.odd}
                                {market.source === 'api-real' && ' 🟢'}
                                {axisConflict && !isMarketSelected && ' (conflito)'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.muted }}>
                {selectedGames.size} jogo(s) selecionado(s) • {selectedMarkets.size} mercado(s)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setSelectedGames(new Set());
                    setSelectedMarkets(new Set());
                    setCustomFTBox(null);
                  }}
                  disabled={false}
                  style={{
                    background: 'transparent', border: `1px solid ${C.muted}`,
                    borderRadius: 6, padding: '8px 16px', fontSize: 12,
                    color: C.muted, cursor: 'pointer',
                  }}
                >
                  Limpar
                </button>
                <button
                  onClick={handleGenerateCustomFTBox}
                  disabled={selectedGames.size < 2 || selectedMarkets.size < 2 ? true : false}
                  style={{
                    background: selectedGames.size >= 2 && selectedMarkets.size >= 2 ? C.gold : C.muted,
                    color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Gerar Box FT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🆕 BOX FT PERSONALIZADO */}
        {customFTBox && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#ff9800', display: 'flex', alignItems: 'center', gap: 8 }}>
                🔥 Box FT Personalizado
              </h2>
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div key={customFTBox.id} style={{
                background: C.surface, border: `2px solid #ff980040`,
                borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ff9800' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ff9800', marginBottom: 2 }}>
                      🔥 Box FT Personalizado
                    </div>
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {new Set(customFTBox.selections?.map((sel: any) => sel.match)).size} jogos · {customFTBox.selections?.length ?? 0} mercados · Stake R$ {customFTBox.suggestedStake?.toFixed(2) ?? '25.00'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#ff9800' }}>
                      {customFTBox.combinedOdd > 0 ? customFTBox.combinedOdd.toFixed(2) : '—'}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11 }}>
                      Retorno R$ {customFTBox.expectedReturn ? customFTBox.expectedReturn.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(
                    customFTBox.selections?.reduce((acc: any, sel: any) => {
                      if (!acc[sel.match]) acc[sel.match] = [];
                      acc[sel.match].push(sel);
                      return acc;
                    }, {}) || {}
                  ).map(([match, sels]: [string, any], j: number) => {
                    const gameOdd = sels.reduce((acc: number, sel: any) => acc * (sel.odd > 1 ? sel.odd : 1), 1);
                    return (
                      <div key={`custom-ft-${match}-${j}`} style={{
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{match}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>Odd jogo: {gameOdd.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sels.map((sel: any, k: number) => (
                            <div key={`custom-ft-sel-${sel.market}-${k}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: C.text }}>{sel.market}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{sel.odd > 1 ? sel.odd.toFixed(2) : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Risco: <strong style={{ color: customFTBox.riskLevel === 'low' ? C.green : customFTBox.riskLevel === 'high' ? C.red : C.gold }}>{customFTBox.riskLevel === 'low' ? 'Baixo' : customFTBox.riskLevel === 'high' ? 'Alto' : 'Médio'}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
                    {customFTBox.riskReward ?? ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BILHETES */}
        {suggestions.length > 0 && (
          <div>
            {/* SESSÃO: SINFONIA DE PARDAIS */}
            {suggestions.filter(s => s.type === 'sinfonia').length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#00e676', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🐦 Sinfonia de Pardais (Bet Builder)
                  </h2>
                  {ignoredMatches.length > 0 && (
                    <button
                      onClick={handleClearIgnored}
                      disabled={false}
                      style={{
                        background: 'transparent', border: `1px solid ${C.muted}`,
                        borderRadius: 6, padding: '4px 10px', fontSize: 11,
                        color: C.muted, cursor: 'pointer',
                      }}
                    >
                      🔄 Restaurar {ignoredMatches.length} jogo(s)
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 16 }}>
                  {suggestions.filter(s => s.type === 'sinfonia').map((s, i) => {
                    const style = TICKET_STYLES[s.type];
                    const combinedOdd = s.combinedOdd ?? s.totalOdds ?? 0;
                    const nLegs = s.selections?.length ?? 0;
                    return (
                      <div key={s.id ?? `sinfonia-${i}`} style={{
                        background: C.surface, border: `2px solid ${style.color}40`,
                        borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: style.color }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: style.color, marginBottom: 2 }}>
                              {style.icon} {style.label}
                            </div>
                            <div style={{ color: C.muted, fontSize: 12 }}>
                              {new Set(s.selections?.map((sel: any) => sel.match)).size} jogos · {nLegs} mercados · Stake R$ {s.suggestedStake?.toFixed(2) ?? '25.00'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: style.color }}>
                              {combinedOdd > 0 ? combinedOdd.toFixed(2) : '—'}
                            </div>
                            <div style={{ color: C.muted, fontSize: 11 }}>
                              Retorno R$ {s.expectedReturn ? s.expectedReturn.toFixed(2) : '—'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {Object.entries(
                            s.selections?.reduce((acc: any, sel: any) => {
                              if (!acc[sel.match]) acc[sel.match] = [];
                              acc[sel.match].push(sel);
                              return acc;
                            }, {}) || {}
                          ).map(([match, sels]: [string, any], j: number) => {
                            const gameOdd = sels.reduce((acc: number, sel: any) => acc * (sel.odd > 1 ? sel.odd : 1), 1);
                            return (
                              <div key={`sinfonia-${match}-${j}`} style={{
                                background: C.bg, border: `1px solid ${C.border}`,
                                borderRadius: 8, padding: '12px',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>Criar Aposta</div>
                                    <div style={{ color: C.muted, fontSize: 12 }}>{match}</div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                                      {gameOdd > 1 ? gameOdd.toFixed(2) : '—'}
                                    </div>
                                    <button
                                      onClick={handleIgnoreMatchClick(match)}
                                      title={`Trocar ${match} por outro jogo`}
                                      disabled={false}
                                      style={{
                                        background: 'transparent', border: `1px solid ${C.muted}40`,
                                        borderRadius: 6, padding: '3px 8px', fontSize: 12,
                                        color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      🔄
                                    </button>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: 5, top: 10, bottom: 10, width: 2, background: C.border, zIndex: 0 }} />
                                  
                                  {sels.map((sel: any, k: number) => (
                                    <div key={`sinfonia-sel-${sel.market}-${k}`} style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                                      <div style={{ 
                                        width: 12, height: 12, borderRadius: '50%', 
                                        background: C.bg, border: `2px solid ${C.muted}`,
                                        marginRight: 10, marginTop: 4, flexShrink: 0 
                                      }} />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                                          {sel.market}
                                        </div>
                                        <div style={{ color: C.muted, fontSize: 11 }}>
                                          {sel.reason?.split('·')[0]?.trim() || sel.gameProfile}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 12, color: C.muted }}>
                            Risco: <strong style={{ color: s.riskLevel === 'low' ? C.green : s.riskLevel === 'high' ? C.red : C.gold }}>{s.riskLevel === 'low' ? 'Baixo' : s.riskLevel === 'high' ? 'Alto' : 'Médio'}</strong>
                          </span>
                          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
                            {s.riskReward ?? ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SESSÃO: MÚLTIPLAS TRADICIONAIS */}
            {suggestions.filter(s => s.type !== 'sinfonia').length > 0 && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: C.text }}>
                  🎯 Múltiplas Inteligentes
                </h2>
                <div style={{ display: 'grid', gap: 16 }}>
                  {suggestions.filter(s => s.type !== 'sinfonia').map((s, i) => {
                    const style = TICKET_STYLES[s.type] ?? TICKET_STYLES.bronze;
                    const combinedOdd = s.combinedOdd ?? s.totalOdds ?? 0;
                    const nLegs = s.selections?.length ?? 0;
                    return (
                      <div key={s.id ?? `trad-${i}`} style={{
                        background: C.surface, border: `1px solid ${style.color}40`,
                        borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: style.color }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: style.color, marginBottom: 2 }}>
                              {style.icon} {style.label}
                            </div>
                            <div style={{ color: C.muted, fontSize: 12 }}>
                              {new Set(s.selections?.map((sel: any) => sel.match)).size} jogos · {nLegs} mercados · Stake R$ {s.suggestedStake?.toFixed(2) ?? '25.00'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: style.color }}>
                              {combinedOdd > 0 ? combinedOdd.toFixed(2) : '—'}
                            </div>
                            <div style={{ color: C.muted, fontSize: 11 }}>
                              Retorno R$ {s.expectedReturn ? s.expectedReturn.toFixed(2) : '—'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {s.selections?.map((sel: any, j: number) => (
                            <div key={`trad-sel-${sel.market}-${j}`} style={{
                              background: C.bg, border: `1px solid ${C.border}`,
                              borderRadius: 8, padding: '10px 14px',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {sel.match}
                                </div>
                                <div style={{ color: C.muted, fontSize: 11 }}>
                                  {sel.market} · {sel.league ?? ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', marginLeft: 12 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: sel.odd > 1 ? C.text : C.muted }}>
                                  {sel.odd > 1 ? Number(sel.odd).toFixed(2) : 'sem odd'}
                                </div>
                                {sel.gameProfile && (
                                  <span style={{ fontSize: 10, color: C.muted }}>{sel.gameProfile}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 11, color: C.muted }}>
                            Risco: <strong style={{ color: s.riskLevel === 'low' ? C.green : s.riskLevel === 'high' ? C.red : C.gold }}>{s.riskLevel === 'low' ? 'Baixo' : s.riskLevel === 'high' ? 'Alto' : 'Médio'}</strong>
                          </span>
                          <span style={{ fontSize: 11, color: C.muted }}>
                            {s.riskReward ?? ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* JOGOS NÃO ENCONTRADOS */}
        {showUnmatchedDetails && unmatchedGames.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: C.gold }}>
              ⚠️ Jogos não encontrados na API ({unmatchedGames.length})
            </h2>
            <div style={{ background: C.surface, border: `1px solid ${C.gold}`, borderRadius: 8, padding: 16 }}>
              {unmatchedGames.map((game, i) => (
                <div key={`unmatched-${i}-${game.home || game.homeTeam || 'unknown'}-${game.away || game.awayTeam || 'unknown'}`} style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
                  {game.home || game.homeTeam || '?'} x {game.away || game.awayTeam || '?'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ESTADO VAZIO */}
        {games.length === 0 && (
          <EmptyState
            icon="🎫"
            title="Nenhum jogo carregado"
            subtitle="Carregue o CSV do dia no Admin para gerar bilhetes."
            actionLabel="⚙️ Ir para Admin"
            actionHref="/admin"
          />
        )}
      </div>
    </main>
  );
}
