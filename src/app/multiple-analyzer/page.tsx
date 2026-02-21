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
      const result = analyzer.analyzeLiveMultiples(text);
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
      const apiKey = localStorage.getItem('football-api-key') ?? '';
      if (!apiKey) {
        setError('API Football key não configurada. Configure em Admin > Configurações de API.');
        return;
      }
      
      // Chamar API route server-side (evita CORS)
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
        const enriched = analyzer.analyzeLiveMultiples(csvText, result.oddsMap, result.fixtureMap);
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
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>� Bilhetes Gerados</h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {suggestions.map((s, i) => {
                const style = TICKET_STYLES[s.type] ?? TICKET_STYLES.bronze;
                const combinedOdd = s.combinedOdd ?? s.totalOdds ?? 0;
                const nLegs = s.selections?.length ?? 0;
                return (
                  <div key={s.id ?? i} style={{
                    background: C.surface, border: `2px solid ${style.color}40`,
                    borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Faixa de cor no topo */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: style.color }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: style.color, marginBottom: 2 }}>
                          {style.icon} {style.label}
                        </div>
                        <div style={{ color: C.muted, fontSize: 12 }}>
                          {nLegs} pernas · Stake R$ {s.suggestedStake?.toFixed(2) ?? '25.00'}
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

                    {/* Risco / Valor */}
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
