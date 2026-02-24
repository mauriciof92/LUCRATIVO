'use client';

import { useState, useMemo } from 'react';
import { useBacktest } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';
import { PreLiveMultipleAnalyzer } from '../../lib/pre-live-multiple-analyzer';
import type { PreMatchOdds } from '../../lib/footballApi';
import { C, KPI, EmptyState, ProfileBadge } from '../../components/ui';

const TICKET_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  bronze:    { label: 'Seguro',    color: '#58a6ff', icon: '🛡️' },
  silver:    { label: 'Padrão',    color: '#c0c0c0', icon: '⚖️' },
  gold:      { label: 'Forte',     color: '#ffd700', icon: '💪' },
  agressivo: { label: 'Agressivo', color: '#ff6b00', icon: '🚀' },
  bingo:     { label: 'Bingo',     color: '#ff1744', icon: '💣' },
  sinfonia:  { label: 'Sinfonia',  color: '#00e676', icon: '🐦' },
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
    if (!text) { 
      setError('Nenhum jogo encontrado. Carregue dados no Admin primeiro.'); 
      return; 
    }
    setAnalyzing(true);
    setError('');
    try {
      const result = analyzer.analyzeLiveMultiples(text, undefined, undefined, ignoredMatches);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
      if ((result.suggestions ?? []).length === 0) {
        setError(`Nenhuma múltipla gerada. ${result.summary.totalGames} jogos no banco, ${result.summary.qualityGames} com qualidade suficiente (score≥65%, conf≥55%). Cada perna precisa de odd entre 1.20–2.50.`);
      }
    } catch (e: any) {
      setError('Erro ao analisar: ' + (e?.message ?? String(e)));
    } finally {
      setAnalyzing(false);
    }
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
        const enriched = analyzer.analyzeLiveMultiples(csvText, result.oddsMap, result.fixtureMap, ignoredMatches);
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

  // 🔄 Handler: Ignorar jogo e regerar bilhetes (efeito roleta — só na sessão)
  const handleIgnoreMatch = (matchName: string) => {
    const updated = [...ignoredMatches, matchName];
    setIgnoredMatches(updated);
    // Regerar bilhetes imediatamente sem o jogo ignorado
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = analyzer.analyzeLiveMultiples(text, undefined, undefined, updated);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
    } catch (e) {
      console.error('Erro ao regerar bilhetes:', e);
    }
  };

  // 🔄 Handler: Limpar todos os jogos ignorados e regerar
  const handleClearIgnored = () => {
    setIgnoredMatches([]);
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = analyzer.analyzeLiveMultiples(text);
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
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Status</div>
              <div style={{ color: games.length > 0 ? C.green : C.gold, fontSize: 14, fontWeight: 600 }}>
                {games.length > 0 ? '✅ Dados carregados' : '⚠️ Carregue no Admin'}
              </div>
            </div>
          </div>
        </div>

        {/* AÇÕES */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || loadingOdds || games.length === 0}
            style={{
              background: analyzing || loadingOdds || games.length === 0 ? C.muted : C.blue,
              color: '#000', border: 'none', borderRadius: 8,
              padding: '12px 24px', fontSize: 14, fontWeight: 700,
              cursor: (analyzing || loadingOdds || games.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {analyzing ? '⏳ Analisando...' : '🚀 Gerar Múltiplas'}
          </button>

          {suggestions.length > 0 && (
            <button
              onClick={handleFetchOdds}
              disabled={loadingOdds}
              style={{
                background: loadingOdds ? C.muted : C.gold,
                color: '#000', border: 'none', borderRadius: 8,
                padding: '12px 24px', fontSize: 14, fontWeight: 700,
                cursor: loadingOdds ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingOdds ? '⏳ Buscando...' : '🎯 Buscar Odds Reais'}
            </button>
          )}
        </div>

        {/* ERROS */}
        {error && (
          <div style={{
            background: '#450a0a', border: `1px solid ${C.red}`,
            borderRadius: 8, padding: 16, marginBottom: 24,
            color: C.red, fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* RESUMO */}
        {summary && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>📈 Resumo da Análise</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Total de Jogos</div>
                <div style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>{summary.totalGames}</div>
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Qualidade</div>
                <div style={{ color: C.green, fontSize: 18, fontWeight: 700 }}>{summary.qualityGames}</div>
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Múltiplas</div>
                <div style={{ color: C.blue, fontSize: 18, fontWeight: 700 }}>{suggestions.length}</div>
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Taxa Média</div>
                <div style={{ color: C.gold, fontSize: 18, fontWeight: 700 }}>
                  {summary.avgOdds ? summary.avgOdds.toFixed(2) : 'N/A'}
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
                              <div key={j} style={{
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
                                      onClick={() => handleIgnoreMatch(match)}
                                      title={`Trocar ${match} por outro jogo`}
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
                                    <div key={k} style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
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
                            <div key={j} style={{
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
                <div key={i} style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
                  {game.homeTeam} x {game.awayTeam}
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
