'use client';

import { useState, useMemo, Fragment } from 'react';
import { useBacktest, STAKE_FIXA } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';
import { Badge, KPI, TH, TD, C, ProfileBadge, PoisonBadges, FavoritoBar, SectionBox, EmptyState, mktCat } from '../../components/ui';

export default function BacktestPage() {
  const { results, summary, loading, filter, setFilter, confirmed, wins, totalProfit, roi, hitRateMain, leagues } = useBacktest();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterLeague, setFilterLeague] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = useMemo(() => {
    let list = [...results];
    if (filterStatus !== 'all') {
      list = list.filter(r => r.mainMarket.result === filterStatus);
    }
    if (filterLeague) {
      list = list.filter(r => r.league === filterLeague);
    }
    return list;
  }, [results, filterStatus, filterLeague]);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui,sans-serif' }}>
      <NavHeader activePage="/backtest" subtitle={`${results.length} jogos`} />

      <div style={{ padding: '28px 40px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>📋 Histórico de Apostas</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>
            {confirmed.length} confirmadas · {results.length - confirmed.length} pendentes · {hitRateMain.toFixed(1)}% hit rate
          </p>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KPI label="Apostas" value={String(confirmed.length)} sub={`de ${results.length} jogos`} />
          <KPI label="Hit Rate" value={`${hitRateMain.toFixed(1)}%`} sub={`${wins}W / ${confirmed.length - wins}L`} color={hitRateMain >= 55 ? C.green : C.red} />
          <KPI label="ROI" value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`} color={roi >= 0 ? C.green : C.red} />
          <KPI label="Lucro" value={`R$ ${totalProfit.toFixed(2)}`} color={totalProfit >= 0 ? C.green : C.red} />
        </div>

        {results.length === 0 && !loading && (
          <EmptyState
            icon="📋"
            title="Nenhum dado carregado"
            subtitle="Importe um CSV pelo Admin para ver o histórico."
            actionLabel="⚙️ Ir para Admin"
            actionHref="/admin"
          />
        )}

        {/* Filtros */}
        {results.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16,
            padding: '12px 16px', background: C.card,
            border: `1px solid ${C.border}`, borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>Status:</span>
              {['all', 'win', 'lose', 'no-odd', 'avg'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)} style={{
                  background: filterStatus === f ? C.blue : 'transparent',
                  color: filterStatus === f ? '#000' : C.muted,
                  border: `1px solid ${filterStatus === f ? C.blue : C.border}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                }}>
                  {f === 'all' ? 'Todos' : f === 'win' ? '✅ Win' : f === 'lose' ? '❌ Lose' : f === 'avg' ? '📊 Média' : '— Void'}
                </button>
              ))}
            </div>

            <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} style={{
              background: C.bg, color: C.text, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '4px 8px', fontSize: 12, maxWidth: 180,
            }}>
              <option value="">Todas as ligas</option>
              {leagues.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            <span style={{ color: C.muted, fontSize: 12, marginLeft: 'auto', alignSelf: 'center' }}>
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Tabela */}
        {filtered.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <TH>Hora</TH>
                    <TH>Liga</TH>
                    <TH>Jogo</TH>
                    <TH>Placar</TH>
                    <TH>Perfil</TH>
                    <TH>Score</TH>
                    <TH>Mercado</TH>
                    <TH>Odd</TH>
                    <TH>Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const isExpanded = expandedId === r.id;
                    const hourClean = (r.hour || '').replace(/^\d{2}\/\d{2}\s*/, '') || '—';
                    return (
                      <Fragment key={`${r.id}-${r.hour}-${r.league}`}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          style={{
                            borderBottom: `1px solid ${C.border}20`,
                            cursor: 'pointer',
                            background: isExpanded ? `${C.blue}10` : 'transparent',
                          }}
                        >
                          <TD style={{ color: C.muted, whiteSpace: 'nowrap' }}>{hourClean}</TD>
                          <TD style={{ color: C.muted, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.league}
                          </TD>
                          <TD style={{ color: C.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.match}</TD>
                          <TD style={{ color: C.yellow, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {r.status === 'FT' ? `${r.resultHome ?? '?'} – ${r.resultAway ?? '?'}` : r.status || 'NS'}
                          </TD>
                          <TD><ProfileBadge profile={r.profile || 'generic'} /></TD>
                          <TD style={{ color: C.muted, textAlign: 'center' }}>
                            {typeof r.score === 'number' ? `${Math.round(r.score * 100)}%` : '—'}
                          </TD>
                          <TD style={{ color: C.text, maxWidth: 240, whiteSpace: 'normal' }}>
                            {r.mainMarket.label}
                          </TD>
                          <TD style={{ color: C.muted, textAlign: 'center' }}>
                            {r.mainMarket.odd ? Number(r.mainMarket.odd).toFixed(2) : '—'}
                          </TD>
                          <TD><Badge result={r.mainMarket.result} /></TD>
                        </tr>
                        {/* Row expandida */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} style={{ padding: '12px 16px', background: `${C.bg}` }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <PoisonBadges poison={r.poison} />
                                <FavoritoBar fav={r.favorito} />
                                {/* Combo lines */}
                                {r.combo && r.combo.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Linhas combo:</div>
                                    {r.combo.map((c: any, ci: number) => (
                                      <div key={`${r.id}-combo-${ci}`} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '4px 10px', background: C.card, borderRadius: 6, marginBottom: 4,
                                        border: `1px solid ${C.border}`,
                                      }}>
                                        <span style={{ fontSize: 12, color: C.text }}>{c.label}</span>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                          <span style={{ fontSize: 12, color: C.muted }}>
                                            {c.odd ? Number(c.odd).toFixed(2) : '—'}
                                          </span>
                                          <Badge result={c.result} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
