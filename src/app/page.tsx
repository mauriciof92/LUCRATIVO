'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useRef } from 'react';
import { useBacktest, STAKE_FIXA } from '../hooks/useBacktest';
import { NavHeader } from '../components/NavHeader';
import { calculateBlitzScoreFromFavorito } from '../lib/blitz-score';
import { quickStakeAnalysis } from '../lib/bankroll-manager';
import { parseCSV, computeScore, classifyProfile, suggestMainMarket, suggestCombo, getFavorito, computeConfidence, PROFILES } from '../engine';

const C = {
  bg: '#0d1117', surface: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', green: '#3fb950',
  red: '#f85149', blue: '#58a6ff', gold: '#d29922',
  elite: '#f0c040', purple: '#bc8cff',
};

function KpiCard({ label, value, sub, color = C.text }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '24px 28px', flex: 1, minWidth: 180,
    }}>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function getGameTier(score: number, profile: string, hasHTData: boolean): string {
  const adjustedScore = !hasHTData ? Math.max(score, 0.55) : score;
  const pct = Math.round(adjustedScore * 100);
  if (pct >= 80 || profile === 'dominant') return 'elite';
  if (pct >= 65 || ['clear_favorite', 'chutes_ht_fav'].includes(profile)) return 'forte';
  if (pct >= 50) return 'moderado';
  return 'fraco';
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    elite:    { label: '🔥 ELITE',    color: '#f0c040', bg: '#2a2000' },
    forte:    { label: '✅ FORTE',    color: C.green,   bg: '#0d2a0d' },
    moderado: { label: '📊 MODERADO', color: C.blue,    bg: '#0d1a2a' },
    fraco:    { label: '⚠️ FRACO',   color: C.muted,   bg: '#1a1a1a' },
  };
  const t = map[tier] ?? map.fraco;
  return <span style={{ background: t.bg, color: t.color, padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{t.label}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 75 ? '#f0c040' : pct >= 60 ? C.green : pct >= 50 ? C.blue : C.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 56, height: 6, background: '#30363d', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{pct}%</span>
    </div>
  );
}

interface JogoProcessado {
  id: string; match: string; league: string; hour: string;
  score: number; profile: string;
  mainMarket: { label: string; odd: number | null } | null;
  combo: Array<{ label: string; odd: number | null }>;
  blitz: { score: number; tier: string };
  confidence: number;
  hasHTData: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const { results, loading } = useBacktest();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [showCsvInput, setShowCsvInput] = useState(false);
  const [filterTier, setFilterTier] = useState('all');
  const [filterLeague, setFilterLeague] = useState('all');
  const [sortBy, setSortBy] = useState<'score' | 'hour' | 'league'>('score');

  // ── Processar CSV do dia ──────────────────────────────────────────────
  const jogosDodia = useMemo((): JogoProcessado[] => {
    if (!csvText.trim()) return [];
    try {
      const { games } = parseCSV(csvText);
      return (games as any[])
        .filter(g => g.status === 'NS' || !g.status)
        .map(g => {
          const sr = computeScore(g);
          const score = typeof sr === 'number' ? sr : (sr as any)?.score ?? 0;
          if (score < 0.50) return null;
          const fav = getFavorito(g);
          const main = suggestMainMarket(g);
          const combo = (suggestCombo(g) ?? []).slice(0, 2);
          const conf = (computeConfidence(g) as any)?.score ?? 0;
          const hasHTData = (fav?.chFavGol ?? 0) > 0 || (fav?.cantFavHT ?? 0) > 0;
          const blitz = calculateBlitzScoreFromFavorito(fav, 0);
          const profile = classifyProfile(g) ?? 'generic';
          const tier = getGameTier(score, profile, hasHTData);
          return {
            id: String(g.id ?? `${g.home}_${g.away}`),
            match: g.match ?? `${g.home} x ${g.away}`,
            league: g.league ?? '',
            hour: g.hour ?? '',
            score,
            profile,
            mainMarket: main ? { label: main.label, odd: g.odds?.[main.label] ?? null } : null,
            combo: combo.map((c: any) => ({ label: c.label, odd: g.odds?.[c.label] ?? null })),
            blitz: { ...blitz, tier },
            confidence: conf,
            hasHTData,
          } as JogoProcessado;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.score - a.score) as JogoProcessado[];
    } catch { return []; }
  }, [csvText]);

  const availableLeagues = useMemo(() => {
    const s = new Set(jogosDodia.map(j => j.league).filter(Boolean));
    return Array.from(s).sort();
  }, [jogosDodia]);

  const filteredGames = useMemo(() => {
    let list = [...jogosDodia];
    if (filterTier !== 'all') list = list.filter(j => j.blitz.tier === filterTier);
    if (filterLeague !== 'all') list = list.filter(j => j.league === filterLeague);
    if (sortBy === 'hour') list.sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
    else if (sortBy === 'league') list.sort((a, b) => (a.league || '').localeCompare(b.league || ''));
    // default: score (already sorted)
    return list;
  }, [jogosDodia, filterTier, filterLeague, sortBy]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvFileName(f.name);
    const reader = new FileReader();
    reader.onload = ev => { setCsvText(String(ev.target?.result ?? '')); setShowCsvInput(false); };
    reader.readAsText(f, 'utf-8');
  };

  // ── KPIs histórico ────────────────────────────────────────────────────
  const confirmed = useMemo(() =>
    results.filter(r => r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'),
    [results]
  );
  const wins = confirmed.filter(r => r.mainMarket.result === 'win').length;
  const hitRate = confirmed.length > 0 ? (wins / confirmed.length * 100) : 0;
  const profit = confirmed.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0);
  const roi = confirmed.length > 0 ? (profit / (confirmed.length * STAKE_FIXA) * 100) : 0;

  // ── Jogos do banco com score >= 0.50 ─────────────────────────────────
  const jogosHistorico = useMemo(() =>
    results
      .filter(r => (r.score ?? 0) >= 0.50 && (r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 20),
    [results]
  );

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif' }}>

      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 3,
          background: C.blue, animation: 'progress 1.5s ease-in-out infinite', zIndex: 999,
        }} />
      )}

      <NavHeader activePage="/" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: '40px' }}>

        {/* TÍTULO */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>🏆 Panorama do Dia</h1>
          <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          <KpiCard label="Jogos no Banco" value={`${results.length}`} sub={`${confirmed.length} com resultado`} color={C.blue} />
          <KpiCard label="Hit Rate Geral" value={`${hitRate.toFixed(1)}%`} sub={`${wins} wins / ${confirmed.length - wins} loses`} color={hitRate >= 60 ? C.green : hitRate >= 45 ? C.gold : C.red} />
          <KpiCard label="ROI Acumulado" value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`} sub={`${profit >= 0 ? '+' : ''}R$ ${profit.toFixed(2)}`} color={roi >= 0 ? C.green : C.red} />
          <KpiCard label="Jogos do Dia (CSV)" value={`${jogosDodia.length}`} sub={csvText ? 'processados pelo engine' : 'carregue o CSV abaixo'} color={jogosDodia.length > 0 ? '#f0c040' : C.muted} />
        </div>

        {/* ÁREA CSV DO DIA */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCsvInput ? 16 : 0 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#f0c040' }}>📋 CSV do Dia — Jogos NS</h2>
              {!showCsvInput && !csvText && <p style={{ color: C.muted, fontSize: 13, margin: '6px 0 0' }}>Carregue o CSV do dia para ver os jogos com perfis e mercados sugeridos.</p>}
              {csvFileName && <p style={{ color: C.green, fontSize: 12, margin: '4px 0 0' }}>✅ {csvFileName} — {jogosDodia.length} jogos qualificados</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{ background: 'transparent', color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                📁 Carregar arquivo
              </button>
              <button onClick={() => setShowCsvInput(v => !v)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                {showCsvInput ? '▲ Ocultar' : '▼ Colar CSV'}
              </button>
              {csvText && (
                <button onClick={() => { setCsvText(''); setCsvFileName(''); setShowCsvInput(false); }} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>🗑️</button>
              )}
            </div>
          </div>
          {showCsvInput && (
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="Cole o conteúdo do CSV aqui (jogos com status NS — não iniciados)..."
              rows={6}
              style={{ width: '100%', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
            />
          )}
        </div>

        {/* CARDS JOGOS DO DIA */}
        {jogosDodia.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f0c040' }}>
                ⭐ Jogos do Dia — {filteredGames.length}/{jogosDodia.length} qualificados
              </h2>
              <span style={{ color: C.muted, fontSize: 12 }}>score ≥ 50%</span>
            </div>

            {/* BARRA DE FILTROS */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                <option value="all">Todos os tiers</option>
                <option value="elite">🔥 Elite</option>
                <option value="forte">✅ Forte</option>
                <option value="moderado">📊 Moderado</option>
                <option value="fraco">⚠️ Fraco</option>
              </select>
              <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                <option value="all">Todas as ligas</option>
                {availableLeagues.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                <option value="score">Ordenar: Score ↓</option>
                <option value="hour">Ordenar: Horário</option>
                <option value="league">Ordenar: Liga</option>
              </select>
              {(filterTier !== 'all' || filterLeague !== 'all') && (
                <button onClick={() => { setFilterTier('all'); setFilterLeague('all'); }} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>✕ Limpar filtros</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {filteredGames.map(j => {
                const profInfo = (PROFILES as any)[j.profile] ?? { label: j.profile, color: C.muted };
                const isElite = j.score >= 0.75;
                const pct = Math.round(j.score * 100);
                const scoreColor = pct >= 75 ? '#f0c040' : pct >= 60 ? C.green : C.blue;
                return (
                  <div key={j.id} style={{
                    background: C.surface,
                    border: `1px solid ${isElite ? '#f0c04044' : C.border}`,
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    boxShadow: isElite ? '0 0 12px #f0c04018' : 'none',
                  }}>
                    {/* Linha 1: hora + liga + tier */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{j.hour || '—'}</span>
                        <span style={{ color: C.border, fontSize: 10 }}>·</span>
                        <span style={{ color: C.muted, fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.league}</span>
                      </div>
                      <TierBadge tier={j.blitz.tier} />
                    </div>

                    {/* Linha 2: jogo + score */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.3 }}>
                        {isElite && <span style={{ color: '#f0c040', marginRight: 4 }}>⭐</span>}
                        {j.match}
                      </div>
                      <div
                        title={`Score ${pct}% — Baseado em: xG, Força de Ataque (AF), Volatilidade (CV), xC e Chutes HT${!j.hasHTData ? ' · Sem dados HT neste CSV' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'help' }}
                      >
                        <div style={{ width: 40, height: 5, background: '#30363d', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: scoreColor, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: scoreColor, fontWeight: 700, minWidth: 32 }}>{pct}%</span>
                      </div>
                    </div>

                    {/* Linha 3: perfil */}
                    <div>
                      <span style={{ fontSize: 11, color: profInfo.color, background: `${profInfo.color}18`, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                        {profInfo.label}
                      </span>
                    </div>

                    {/* Linha 4: mercado principal */}
                    {j.mainMarket && (
                      <div style={{ background: '#0d2a0d', border: '1px solid #3fb95033', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>MERCADO PRINCIPAL</div>
                          <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>{j.mainMarket.label}</div>
                        </div>
                        <span style={{ fontSize: 18 }}>🎯</span>
                      </div>
                    )}

                    {/* Linha 5: combo */}
                    {j.combo.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {j.combo.map((c, ci) => (
                          <div key={ci} style={{ background: '#0d1a2a', border: '1px solid #58a6ff22', borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10 }}>🔗</span>
                            <span style={{ color: C.blue, fontSize: 12 }}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* HISTÓRICO DO BANCO (score >= 0.50) */}
        {jogosHistorico.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: C.text }}>
              📊 Histórico Recente — Jogos com Score ≥ 50% ({jogosHistorico.length})
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Liga', 'Jogo', 'Perfil', 'Score', 'Mercado', 'Resultado', 'Lucro'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jogosHistorico.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '9px 12px', color: C.muted, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.league}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.match}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.muted, fontSize: 12 }}>{r.profile || '—'}</span>
                      </td>
                      <td style={{ padding: '9px 12px' }}><ScoreBar score={r.score ?? 0} /></td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: '#0d2a0d', color: C.green, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{r.mainMarket.label || '—'}</span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          background: r.mainMarket.result === 'win' ? '#0d2a0d' : '#2a0d0d',
                          color: r.mainMarket.result === 'win' ? C.green : C.red,
                          padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        }}>
                          {r.mainMarket.result === 'win' ? '✅ WIN' : '❌ LOSE'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: Number(r.mainMarket.profit) >= 0 ? C.green : C.red, whiteSpace: 'nowrap' }}>
                        {Number(r.mainMarket.profit) >= 0 ? '+' : ''}R$ {Number(r.mainMarket.profit).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ESTADO VAZIO */}
        {results.length === 0 && !loading && !csvText && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nenhum dado carregado</div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>Importe um CSV histórico pelo Backtest, ou carregue o CSV do dia acima</div>
            <button onClick={() => router.push('/backtest')} style={{ background: C.blue, color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              🧪 Ir para Backtest
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </main>
  );
}
