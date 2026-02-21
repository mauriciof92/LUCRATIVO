'use client';

import { useState, useRef, useMemo } from 'react';
import { useBacktest } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';
import { PreLiveMultipleAnalyzer } from '../../lib/pre-live-multiple-analyzer';
import type { PreMatchOdds } from '../../lib/footballApi';

const C = {
  bg: '#0d1117', surface: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', green: '#3fb950',
  red: '#f85149', blue: '#58a6ff', gold: '#d29922',
  elite: '#f0c040', purple: '#bc8cff',
};

export default function MultipleAnalyzerPage() {
  const { results } = useBacktest();
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [unmatchedGames, setUnmatchedGames] = useState<any[]>([]);
  const [showUnmatchedDetails, setShowUnmatchedDetails] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyzer = useMemo(() => new PreLiveMultipleAnalyzer(), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setCsvText(String(ev.target?.result ?? ''));
    reader.readAsText(f, 'utf-8');
  };

  const handleAnalyze = async () => {
    const text = csvText.trim();
    if (!text) { setError('Cole ou carregue o CSV do dia primeiro.'); return; }
    setAnalyzing(true);
    setError('');
    try {
      const result = analyzer.analyzeLiveMultiples(text);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
      if ((result.suggestions ?? []).length === 0) {
        setError(`Nenhuma múltipla gerada. ${result.summary.totalGames} jogos no CSV, ${result.summary.qualityGames} com qualidade suficiente (score≥55%, conf≥45%). Verifique se o CSV tem jogos NS (não iniciados).`);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFetchOdds = async () => {
    if (!csvText.trim()) return;
    setLoadingOdds(true);
    setError('');
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // 🆕 Use POST endpoint with CSV text for optimized fetching
      const oddsResponse = await fetch('/api/football-odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: csvText.trim(), date: today })
      });
      
      if (!oddsResponse.ok) {
        throw new Error('Failed to fetch odds');
      }
      const oddsData = await oddsResponse.json();
      
      // Re-analyze with real odds
      const result = analyzer.analyzeLiveMultiples(csvText, oddsData.oddsMap, oddsData.fixtureMap);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
      
      console.log(`[ODDS] Optimized: ${oddsData.matched?.length || 0} matched, ${oddsData.unmatched?.length || 0} unmatched, ${oddsData.reqUsed} requests`);
      
      // Show unmatched games warning
      if (oddsData.unmatched?.length > 0) {
        console.warn(`[ODDS] Games without odds:`, oddsData.unmatched.map((u: any) => `${u.home} x ${u.away}`));
        setUnmatchedGames(oddsData.unmatched);
      } else {
        setUnmatchedGames([]);
      }
      
      if ((result.suggestions ?? []).length === 0) {
        setError(`Nenhuma múltipla gerada com odds reais. ${result.summary.totalGames} jogos no CSV, ${result.summary.qualityGames} com qualidade suficiente.`);
      }
    } catch (err) {
      console.error('Erro ao buscar odds:', err);
      setError('Erro ao buscar odds. Verifique o console.');
    } finally {
      setLoadingOdds(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif' }}>

      <NavHeader activePage="/multiple-analyzer" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: '40px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>⚡ Gerador de Múltiplas</h1>
          <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
            Cole ou carregue o CSV do dia (jogos NS — não iniciados) para gerar bilhetes
          </p>
        </div>

        {/* ÁREA DE UPLOAD DO CSV DO DIA */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>📂 CSV do Dia (jogos NS)</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                background: 'transparent', color: C.blue,
                border: `1px solid ${C.blue}`, borderRadius: 8,
                padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
              }}
            >
              📁 Carregar arquivo
            </button>
            {fileName && <span style={{ color: C.green, fontSize: 13 }}>✅ {fileName}</span>}
          </div>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder="Ou cole o conteúdo do CSV aqui..."
            rows={6}
            style={{
              width: '100%', background: C.bg, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || loadingOdds || !csvText.trim()}
              style={{
                background: analyzing || loadingOdds || !csvText.trim() ? C.muted : C.blue,
                color: '#000', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: analyzing || loadingOdds || !csvText.trim() ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              {analyzing ? '⏳ Analisando...' : '⚡ Gerar Múltiplas'}
            </button>
            
            <button
              onClick={handleFetchOdds}
              disabled={loadingOdds || analyzing || !csvText.trim()}
              style={{
                background: loadingOdds || analyzing || !csvText.trim() ? C.muted : 'linear-gradient(135deg, #2196F3, #1976D2)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: loadingOdds || analyzing || !csvText.trim() ? 'not-allowed' : 'pointer',
                flex: 1,
              }}
            >
              {loadingOdds ? '⏳ Buscando...' : '🎲 Buscar Odds Reais'}
            </button>
            
            {csvText && (
              <button
                onClick={() => { setCsvText(''); setFileName(''); setSuggestions([]); setSummary(null); setError(''); }}
                style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}
              >
                🗑️ Limpar
              </button>
            )}
          </div>
        </div>

        {/* RESUMO DA ANÁLISE */}
        {summary && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Jogos no CSV', value: String(summary.totalGames) },
              { label: 'Com qualidade', value: String(summary.qualityGames), color: summary.qualityGames > 0 ? C.green : C.red },
              { label: 'Múltiplas geradas', value: String(summary.confluencePairs), color: summary.confluencePairs > 0 ? C.gold : C.muted },
              { label: 'Confiança média', value: summary.avgConfidence > 0 ? `${Math.min(100, summary.avgConfidence > 1 ? summary.avgConfidence : summary.avgConfidence * 100).toFixed(0)}%` : '—' },
            ].map(k => (
              <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 120 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.color ?? C.text }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: '#1a0a0a', border: `1px solid ${C.red}44`, borderRadius: 10, padding: '12px 16px', marginBottom: 24, color: C.red, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* 🆕 Unmatched games warning */}
        {unmatchedGames.length > 0 && (
          <div style={{ background: '#1a1a0a', border: `1px solid ${C.gold}44`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>
                ⚠️ {unmatchedGames.length} jogo{unmatchedGames.length > 1 ? 's' : ''} sem odds
              </span>
              <button
                onClick={() => setShowUnmatchedDetails(!showUnmatchedDetails)}
                style={{
                  background: 'transparent', color: C.gold, border: `1px solid ${C.gold}66`,
                  borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer'
                }}
              >
                {showUnmatchedDetails ? 'Ocultar' : 'Ver detalhes'}
              </button>
            </div>
            
            {/* Summary of first few games */}
            {!showUnmatchedDetails && unmatchedGames.length > 0 && (
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                {unmatchedGames.slice(0, 3).map((u, i) => (
                  <span key={i}>
                    {u.home} x {u.away}
                    {i < Math.min(2, unmatchedGames.length - 1) && ', '}
                  </span>
                ))}
                {unmatchedGames.length > 3 && ` e mais ${unmatchedGames.length - 3}`}
              </div>
            )}
            
            {/* Detailed list */}
            {showUnmatchedDetails && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}33` }}>
                {unmatchedGames.map((u, i) => (
                  <div key={i} style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
                    • {u.home} x {u.away} ({u.league})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BILHETES */}
        {suggestions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: C.elite }}>
              🎯 {suggestions.length} Bilhete{suggestions.length > 1 ? 's' : ''} Gerado{suggestions.length > 1 ? 's' : ''}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {suggestions.map((s: any, i: number) => {
                const typeMap: Record<string, { icon: string; label: string; color: string; border: string }> = {
                  bronze:    { icon: '🛡️', label: 'SEGURO',    color: C.green,  border: C.green },
                  silver:    { icon: '⚖️', label: 'PADRÃO',    color: C.blue,   border: C.blue },
                  gold:      { icon: '💪', label: 'FORTE',     color: C.gold,   border: C.gold },
                  agressivo: { icon: '🚀', label: 'AGRESSIVO', color: C.purple, border: C.purple },
                  bingo:     { icon: '💣', label: 'BINGO',     color: C.elite,  border: C.elite },
                };
                const tm = typeMap[s.type] ?? { icon: '🎯', label: String(s.type).toUpperCase(), color: C.muted, border: C.border };
                return (
                <div key={i} style={{
                  background: C.surface,
                  border: `2px solid ${tm.border}66`,
                  borderRadius: 12, padding: 20,
                  boxShadow: s.type === 'bingo' || s.type === 'agressivo' ? `0 0 16px ${tm.border}33` : 'none',
                }}>
                  {/* Cabeçalho do bilhete */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 22 }}>{tm.icon}</span>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: tm.color }}>{tm.label}</span>
                        <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{(s.selections ?? []).length} pernas</span>
                      </div>
                      <span style={{ background: `${tm.border}22`, color: tm.color, padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        {s.riskReward ?? '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ background: '#0d2a0d', color: C.green, padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                        Odd {typeof s.combinedOdd === 'number' ? s.combinedOdd.toFixed(2) : s.combinedOdd}
                      </span>
                      <span style={{ color: C.muted, fontSize: 13 }}>
                        Stake: <strong style={{ color: C.text }}>R$ {typeof s.suggestedStake === 'number' ? s.suggestedStake.toFixed(2) : '25.00'}</strong>
                      </span>
                      <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>
                        → R$ {typeof s.combinedOdd === 'number' && typeof s.suggestedStake === 'number' ? (s.combinedOdd * s.suggestedStake).toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                  {/* Seleções */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(s.legs ?? s.selections ?? []).map((leg: any, j: number) => (
                      <div key={j} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: C.bg, borderRadius: 8,
                        border: `1px solid ${C.border}`,
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{leg.game?.home ?? leg.match ?? '—'}</div>
                          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{leg.game?.league ?? leg.league ?? ''} · {leg.game?.hour ?? leg.hour ?? ''}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ background: '#0d2a0d', color: C.green, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            {leg.market ?? leg.label ?? '—'}
                          </span>
                          {leg.odd > 1
                            ? <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{leg.odd.toFixed(2)}</span>
                            : <span style={{ color: C.muted, fontSize: 11, fontStyle: 'italic' }}>sem odd no CSV</span>
                          }
                          {/* 🆕 Odd quality tag */}
                          {leg.oddTag && (
                            <span className={`selection-tag ${
                              leg.oddTag === 'SEM ODD' ? 'tag-noodd' : 
                              leg.oddTag === 'ODD BAIXA' ? 'tag-lowodd' : ''
                            }`} style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}>
                              {leg.oddTag === 'SEM ODD' ? '🔴 SEM ODD' : '🟠 ODD BAIXA'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        )}

        {/* INSTRUÇÃO INICIAL */}
        {!csvText && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Cole o CSV do dia acima</div>
            <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
              O CSV deve conter os jogos de <strong style={{ color: C.text }}>hoje que ainda não começaram</strong> (status NS).
              O sistema irá analisar e gerar os melhores bilhetes de múltiplas.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
