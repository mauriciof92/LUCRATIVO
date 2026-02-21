'use client';

import { useMemo, useState } from 'react';
import { useBacktest, STAKE_FIXA } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';

const C = {
  bg: '#0d1117', surface: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', green: '#3fb950',
  red: '#f85149', blue: '#58a6ff', gold: '#d29922',
  elite: '#f0c040', purple: '#bc8cff',
};

const catLabel = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('finaliz') || l.includes('chute')) return 'Finalizações HT';
  if (l.includes('canto') && (l.includes('ht') || l.includes('1t'))) return 'Cantos HT';
  if (l.includes('canto')) return 'Cantos FT';
  if (l.includes('over 2.5')) return 'Over 2.5 FT';
  if (l.includes('over 1.5')) return 'Over 1.5 FT';
  if (l.includes('btts') || l.includes('ambas')) return 'BTTS';
  if (l.includes('over 0.5')) return 'Gols HT';
  if (l.includes('vence')) return 'Fav Vence';
  return 'Outros';
};

function heatColor(hitRate: number, n: number): string {
  if (n < 3) return '#1a1a2a';
  if (hitRate >= 75) return '#0d4a1a';
  if (hitRate >= 65) return '#1a3a0d';
  if (hitRate >= 55) return '#2a3a00';
  if (hitRate >= 45) return '#3a2a00';
  if (hitRate >= 35) return '#3a1a00';
  return '#3a0d0d';
}

function heatText(hitRate: number, n: number): string {
  if (n < 3) return C.muted;
  if (hitRate >= 65) return C.green;
  if (hitRate >= 50) return C.gold;
  return C.red;
}

export default function PatternsPage() {
  const { results, loading } = useBacktest();
  const [minSamples, setMinSamples] = useState(5);

  const confirmed = useMemo(() =>
    results.filter(r => r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'),
    [results]
  );

  // Ranking de mercados
  const marketRanking = useMemo(() => {
    const map: Record<string, { wins: number; total: number; profit: number }> = {};
    confirmed.forEach(r => {
      const cat = catLabel(r.mainMarket.label || '');
      if (!map[cat]) map[cat] = { wins: 0, total: 0, profit: 0 };
      map[cat].total++;
      if (r.mainMarket.result === 'win') map[cat].wins++;
      map[cat].profit += Number(r.mainMarket.profit || 0);
    });
    return Object.entries(map)
      .map(([market, v]) => ({
        market,
        total: v.total,
        wins: v.wins,
        hitRate: v.total > 0 ? (v.wins / v.total * 100) : 0,
        profit: v.profit,
        roi: v.total > 0 ? (v.profit / (v.total * STAKE_FIXA) * 100) : 0,
        ev: v.total > 0 ? (v.profit / v.total) : 0,
        rank: 0,
      }))
      .filter(m => m.total >= minSamples)
      .sort((a, b) => b.hitRate - a.hitRate)
      .map((m, i) => ({ ...m, rank: i + 1 }));
  }, [confirmed, minSamples]);

  // Mapa de calor: Liga × Mercado
  const leagues = useMemo(() => {
    const s = new Set<string>();
    confirmed.forEach(r => { if (r.league) s.add(r.league); });
    return Array.from(s).sort();
  }, [confirmed]);

  const markets = useMemo(() => {
    const s = new Set<string>();
    confirmed.forEach(r => { s.add(catLabel(r.mainMarket.label || '')); });
    return Array.from(s).sort();
  }, [confirmed]);

  const heatMap = useMemo(() => {
    const map: Record<string, Record<string, { wins: number; total: number }>> = {};
    confirmed.forEach(r => {
      const l = r.league || 'Desconhecida';
      const m = catLabel(r.mainMarket.label || '');
      if (!map[l]) map[l] = {};
      if (!map[l][m]) map[l][m] = { wins: 0, total: 0 };
      map[l][m].total++;
      if (r.mainMarket.result === 'win') map[l][m].wins++;
    });
    return map;
  }, [confirmed]);

  // Limiares ótimos de chFavGol
  const thresholdAnalysis = useMemo(() => {
    const thresholds = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
    return thresholds.map(t => {
      const subset = confirmed.filter(r => {
        const chFavGol = r.favorito?.chFavGol ?? 0;
        return chFavGol >= t;
      });
      const wins = subset.filter(r => r.mainMarket.result === 'win').length;
      const hitRate = subset.length > 0 ? (wins / subset.length * 100) : 0;
      const profit = subset.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0);
      const roi = subset.length > 0 ? (profit / (subset.length * STAKE_FIXA) * 100) : 0;
      const score = subset.length >= 3 ? hitRate * Math.log(subset.length) : 0;
      return { threshold: t, n: subset.length, wins, hitRate, roi, profit, score };
    });
  }, [confirmed]);

  const optimalThreshold = useMemo(() =>
    thresholdAnalysis.reduce((best, cur) => cur.score > best.score ? cur : best,
      thresholdAnalysis[0] ?? { threshold: 5, score: 0 }),
    [thresholdAnalysis]
  );

  // Padrões de perfil
  const profileStats = useMemo(() => {
    const map: Record<string, { wins: number; total: number; profit: number }> = {};
    confirmed.forEach(r => {
      const p = r.profile || 'unknown';
      if (!map[p]) map[p] = { wins: 0, total: 0, profit: 0 };
      map[p].total++;
      if (r.mainMarket.result === 'win') map[p].wins++;
      map[p].profit += Number(r.mainMarket.profit || 0);
    });
    return Object.entries(map)
      .map(([profile, v]) => ({
        profile,
        total: v.total,
        wins: v.wins,
        hitRate: v.total > 0 ? (v.wins / v.total * 100) : 0,
        profit: v.profit,
        roi: v.total > 0 ? (v.profit / (v.total * STAKE_FIXA) * 100) : 0,
      }))
      .filter(p => p.total >= 3)
      .sort((a, b) => b.hitRate - a.hitRate);
  }, [confirmed]);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif' }}>

      <NavHeader activePage="/patterns" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: '40px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>🔬 Mineração de Padrões</h1>
          <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
            {confirmed.length} apostas confirmadas · Limiares ótimos e mapa de calor
          </p>
        </div>

        {/* FILTRO AMOSTRAS MÍNIMAS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32, alignItems: 'center' }}>
          <span style={{ color: C.muted, fontSize: 13 }}>Amostras mínimas:</span>
          {[3, 5, 10, 20].map(n => (
            <button key={n} onClick={() => setMinSamples(n)} style={{
              background: minSamples === n ? C.blue : 'transparent',
              color: minSamples === n ? '#000' : C.muted,
              border: `1px solid ${minSamples === n ? C.blue : C.border}`,
              borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              fontWeight: minSamples === n ? 700 : 400,
            }}>{n}+</button>
          ))}
        </div>

        {/* RANKING DE MERCADOS */}
        {marketRanking.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>🏆 Ranking de Mercados por Hit Rate</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['#', 'Mercado', 'N', 'W', 'Hit Rate', 'ROI', 'EV médio', 'Lucro'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marketRanking.map((m, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, background: i === 0 ? '#0d2a0d22' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: i === 0 ? C.gold : C.muted, fontWeight: 700 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${m.rank}`}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{m.market}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{m.total}</td>
                    <td style={{ padding: '10px 12px', color: C.green }}>{m.wins}</td>
                    <td style={{ padding: '10px 12px', color: m.hitRate >= 60 ? C.green : m.hitRate >= 45 ? C.gold : C.red, fontWeight: 700 }}>
                      {m.hitRate.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 12px', color: m.roi >= 0 ? C.green : C.red }}>
                      {m.roi >= 0 ? '+' : ''}{m.roi.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 12px', color: m.ev >= 0 ? C.green : C.red }}>
                      {m.ev >= 0 ? '+' : ''}R$ {m.ev.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 12px', color: m.profit >= 0 ? C.green : C.red }}>
                      {m.profit >= 0 ? '+' : ''}R$ {m.profit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ANÁLISE DE LIMIARES chFavGol */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>⚡ Limiares Ótimos — chFavGol</h2>
            <span style={{ background: '#0d2a0d', color: C.green, padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
              Ótimo: chFavGol ≥ {optimalThreshold.threshold} (score={optimalThreshold.score.toFixed(0)})
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Limiar', 'N amostras', 'W', 'Hit Rate', 'ROI', 'Score (HR×ln N)', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {thresholdAnalysis.map((t, i) => {
                  const isOptimal = t.threshold === optimalThreshold.threshold;
                  return (
                    <tr key={i} style={{
                      borderBottom: `1px solid ${C.border}22`,
                      background: isOptimal ? '#0d2a0d33' : 'transparent',
                    }}>
                      <td style={{ padding: '10px 12px', fontWeight: isOptimal ? 700 : 400, color: isOptimal ? C.elite : C.text }}>
                        {isOptimal ? '⭐ ' : ''}≥ {t.threshold}
                      </td>
                      <td style={{ padding: '10px 12px', color: t.n < 5 ? C.red : C.muted }}>{t.n}</td>
                      <td style={{ padding: '10px 12px', color: C.green }}>{t.wins}</td>
                      <td style={{ padding: '10px 12px', color: t.hitRate >= 60 ? C.green : t.hitRate >= 45 ? C.gold : C.red, fontWeight: 700 }}>
                        {t.n > 0 ? `${t.hitRate.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: t.roi >= 0 ? C.green : C.red }}>
                        {t.n > 0 ? `${t.roi >= 0 ? '+' : ''}${t.roi.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.blue, fontWeight: isOptimal ? 700 : 400 }}>
                        {t.score.toFixed(1)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {t.n < 3 ? <span style={{ color: C.muted, fontSize: 11 }}>⚠️ Poucos dados</span> :
                         t.hitRate >= 65 ? <span style={{ color: C.green, fontSize: 11 }}>✅ Forte</span> :
                         t.hitRate >= 50 ? <span style={{ color: C.gold, fontSize: 11 }}>📊 Moderado</span> :
                         <span style={{ color: C.red, fontSize: 11 }}>❌ Fraco</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* MAPA DE CALOR: Liga × Mercado */}
        {leagues.length > 0 && markets.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>🗺️ Mapa de Calor — Liga × Mercado</h2>
            <p style={{ color: C.muted, fontSize: 12, margin: '0 0 20px' }}>
              Verde = Hit Rate alto · Vermelho = Hit Rate baixo · Cinza = menos de 3 amostras
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: C.muted, minWidth: 140 }}>Liga</th>
                    {markets.map(m => (
                      <th key={m} style={{ padding: '6px 8px', textAlign: 'center', color: C.muted, minWidth: 90, fontSize: 10 }}>
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leagues.map(league => (
                    <tr key={league}>
                      <td style={{ padding: '4px 10px', color: C.text, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {league.length > 22 ? league.slice(0, 22) + '…' : league}
                      </td>
                      {markets.map(market => {
                        const cell = heatMap[league]?.[market];
                        const n = cell?.total ?? 0;
                        const hr = n > 0 ? (cell!.wins / n * 100) : 0;
                        return (
                          <td key={market} style={{
                            padding: '4px 8px',
                            textAlign: 'center',
                            background: heatColor(hr, n),
                            color: heatText(hr, n),
                            borderRadius: 4,
                            fontWeight: n >= 3 ? 700 : 400,
                            fontSize: 11,
                          }}>
                            {n >= 3 ? `${hr.toFixed(0)}%` : n > 0 ? `(${n})` : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PADRÕES POR PERFIL */}
        {profileStats.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>🎭 Performance por Perfil de Jogo</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {profileStats.map((p, i) => (
                <div key={i} style={{
                  background: C.bg, border: `1px solid ${p.hitRate >= 60 ? C.green : p.hitRate >= 45 ? C.gold : C.border}`,
                  borderRadius: 10, padding: '14px 18px', minWidth: 160,
                }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{p.profile}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: p.hitRate >= 60 ? C.green : p.hitRate >= 45 ? C.gold : C.red }}>
                    {p.hitRate.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {p.wins}W / {p.total - p.wins}L · ROI {p.roi >= 0 ? '+' : ''}{p.roi.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ESTADO VAZIO */}
        {confirmed.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔬</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {results.length > 0 ? 'Nenhuma aposta confirmada para analisar' : 'Nenhum dado carregado'}
            </div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>
              {results.length > 0
                ? 'Os jogos precisam ter resultado (win/lose) para a mineração funcionar.'
                : 'Importe um CSV pelo Admin para começar.'}
            </div>
            <button onClick={() => { window.location.href = '/admin'; }} style={{
              background: C.blue, color: '#000', border: 'none', borderRadius: 8,
              padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            }}>⚙️ Ir para Admin</button>
          </div>
        )}

      </div>
    </div>
  );
}
