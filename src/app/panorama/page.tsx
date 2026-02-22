'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBacktest, STAKE_FIXA } from '../../hooks/useBacktest';
import { NavHeader } from '../../components/NavHeader';
import { ProfileBadge, PoisonBadges, FavoritoBar, KPI as KpiCard, C, EmptyState } from '../../components/ui';

function GameCard({ game }: { game: any }) {
  const score = Math.round(Number(game.score ?? 0) * 100);
  const tier  =
    score >= 75 ? 'elite' :
    score >= 60 ? 'forte' :
    score >= 45 ? 'moderado' : 'fraco';

  const tierStyle = {
    elite:    { color: '#f0c040', label: '⭐ ELITE' },
    forte:    { color: '#3fb950', label: '✅ FORTE' },
    moderado: { color: '#58a6ff', label: '📊 MODERADO' },
    fraco:    { color: '#8b949e', label: '⚠️ FRACO'  },
  }[tier];

  // Poison: determinar trigger primário para destaque visual nas linhas
  const poison = game.poison;
  const isPoisonActive = poison?.isPoison && poison.triggers?.length > 0;
  const primaryTrigger = isPoisonActive ? poison.primaryTrigger : null;
  const poisonGlow = primaryTrigger?.color ?? null;

  // ── CONSTRUIR LISTA COMPLETA DE LINHAS ────────────────────
  // Sem limite fixo — todas as linhas disponíveis, ordenadas por qualidade
  const allLines = [
    // 1. Linha principal do engine (destaque visual)
    game.mainMarket?.label && {
      label:     game.mainMarket.label,
      odd:       Number(game.mainMarket.odd ?? 0),
      source:    'engine' as const,
      isPrimary: true,
      hitRate:   null,
    },
    // 2. Linhas do combo geradas pelo engine
    ...(game.combo ?? []).map((c: any) => ({
      label:     c.label,
      odd:       Number(c.odd ?? 0),
      source:    'engine' as const,
      isPrimary: false,
      hitRate:   null,
    })),
    // 3. Linhas adicionais apontadas pela base histórica de padrões
    // (populadas pelo pre-live-multiple-analyzer se disponível)
    ...(game.patternLines ?? []).map((p: any) => ({
      label:     p.label,
      odd:       Number(p.odd ?? 0),
      source:    'historico' as const,
      isPrimary: false,
      hitRate:   p.hitRate ?? null,
    })),
  ]
  .filter(Boolean)
  // Filtrar por qualidade: sem odd ou odd operável (não rejeitar sem odd)
  .filter((l): l is NonNullable<typeof l> =>
    !!l && !!l.label && (l.odd === 0 || (l.odd >= 1.10 && l.odd <= 6.00))
  )
  // Ordenar: primária primeiro, depois por valor da odd (maior = mais valor)
  .sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    // Histórico com hit rate alto sobe
    if (a.source === 'historico' && (a.hitRate ?? 0) > 0.65) return -1;
    if (b.source === 'historico' && (b.hitRate ?? 0) > 0.65) return 1;
    return (b.odd ?? 0) - (a.odd ?? 0);
  });

  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${tier === 'elite' ? '#f0c040' :
                            tier === 'forte' ? '#3fb950' : '#30363d'}`,
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 12,
    }}>

      {/* HEADER: hora · liga · tier · profile */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:6 }}>
        <span style={{ color:'#8b949e', fontSize:13 }}>
          🕐 {(game.hour ?? '').replace(/^\d{2}\/\d{2}\s*/, '')} · {game.league}
        </span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {game.profile && <ProfileBadge profile={game.profile} />}
          <span style={{ color:tierStyle.color, fontSize:13,
            fontWeight:700 }}>
            {tierStyle.label} {score}%
          </span>
        </div>
      </div>

      {/* TIMES */}
      <div style={{ fontSize:17, fontWeight:700, marginBottom:10 }}>
        {game.match ?? `${game.home ?? ''} x ${game.away ?? ''}`}
      </div>

      {/* BARRA DE CONFIANÇA */}
      <div style={{ display:'flex', alignItems:'center',
        gap:8, marginBottom:14 }}>
        <div style={{ flex:1, height:5, background:'#30363d',
          borderRadius:3 }}>
          <div style={{
            height:'100%', borderRadius:3,
            width:`${Math.min(100, score)}%`,
            background: tier === 'elite' ? '#f0c040' :
                        tier === 'forte' ? '#3fb950' : '#58a6ff',
          }} />
        </div>
        <span style={{ color:'#8b949e', fontSize:11,
          whiteSpace:'nowrap' }}>
          {score}% conf.
        </span>
      </div>

      {/* TODAS AS LINHAS — sem limite, ordenadas por qualidade */}
      <div style={{ display:'flex', flexDirection:'column', gap:6,
        marginBottom:12 }}>
        {allLines.map((line, i) => {
          const hasOdd    = line.odd > 0;
          const isOpera   = !hasOdd || (line.odd >= 1.20 && line.odd <= 4.00);
          const srcIcon   = line.isPrimary ? '🎯' :
                            line.source === 'historico' ? '📊' : '🔗';
          const lineColor = line.isPrimary ? '#3fb950' :
                            line.source === 'historico' ? '#58a6ff' : '#8b949e';

          // Poison glow na linha principal
          const showPoisonGlow = line.isPrimary && isPoisonActive && poisonGlow;

          return (
            <div key={i} style={{
              background: line.isPrimary
                ? (showPoisonGlow ? `${poisonGlow}12` : '#0d2818')
                : '#1c2128',
              border: `1px solid ${
                showPoisonGlow ? poisonGlow :
                line.isPrimary ? '#3fb950' :
                line.source === 'historico' ? '#1f3a5f' : '#30363d'
              }`,
              borderRadius: 8,
              padding: line.isPrimary ? '10px 14px' : '7px 12px',
              display:'flex', justifyContent:'space-between',
              alignItems:'center',
              boxShadow: showPoisonGlow ? `0 0 12px ${poisonGlow}40` : 'none',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{
                  color: showPoisonGlow ? poisonGlow : lineColor,
                  fontWeight: line.isPrimary ? 700 : 400,
                  fontSize: line.isPrimary ? 14 : 13,
                }}>
                  {srcIcon} {line.label}
                </span>
                {/* Poison badge inline na linha principal */}
                {showPoisonGlow && primaryTrigger && (
                  <span style={{
                    background: `${primaryTrigger.color}25`,
                    border: `1px solid ${primaryTrigger.color}60`,
                    color: primaryTrigger.color,
                    fontSize: 10, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 4,
                  }}>
                    {primaryTrigger.icon} {primaryTrigger.tag}
                  </span>
                )}
                {/* Badge de hit rate da base histórica */}
                {line.source === 'historico' && line.hitRate && (
                  <span style={{
                    background: '#1f3a5f',
                    color: '#58a6ff',
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 4,
                  }}>
                    base {Math.round(line.hitRate * 100)}% HR
                  </span>
                )}
              </div>
              <span style={{
                color: !hasOdd ? '#555' :
                       !isOpera ? '#d29922' :
                       line.isPrimary ? '#e6edf3' : '#8b949e',
                fontWeight: line.isPrimary ? 700 : 400,
                fontSize: line.isPrimary ? 16 : 14,
              }}>
                {hasOdd ? line.odd.toFixed(2) : (
                  <span style={{ fontSize:11, color:'#555' }}>
                    sem odd
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* POISON TRIGGERS */}
      <PoisonBadges poison={game.poison} />

      {/* STATS CHAVE DO FAVORITO */}
      <FavoritoBar fav={game.favorito} />
    </div>
  );
}

export default function PanoramaPage() {
  const router = useRouter();
  const { results, summary, loading, todayGames } = useBacktest();

  // Filtros locais — NÃO buscam dado, apenas filtram o que já está carregado
  const [filterTier, setFilterTier]     = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [filterMarket, setFilterMarket] = useState('');
  const [sortBy, setSortBy]             = useState<'score'|'hora'|'league'>('score');

  const today = new Date().toISOString().split('T')[0];

  // KPIs
  const todayBets = results.filter(r => {
    const d = (r.hour ?? '').split(' ')[0];
    return d === today &&
      (r.mainMarket.result === 'win' || r.mainMarket.result === 'lose');
  });
  const lucroHoje = todayBets.reduce(
    (acc, r) => acc + Number(r.mainMarket.profit ?? 0), 0
  );
  const confirmed = results.filter(r =>
    r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'
  );
  const totalProfit = confirmed.reduce(
    (acc, r) => acc + Number(r.mainMarket.profit ?? 0), 0
  );
  const roi = confirmed.length > 0
    ? (totalProfit / (confirmed.length * STAKE_FIXA)) * 100
    : 0;

  // Ligas e mercados únicos para os selects de filtro
  const availableLeagues = useMemo(() =>
    Array.from(new Set((todayGames ?? results).map((g: any) =>
      g.league).filter(Boolean))).sort()
  , [todayGames, results]);

  // Jogos filtrados e ordenados
  const games = useMemo(() => {
    // Usar todayGames se disponível, senão fallback para results
    const source = (todayGames && todayGames.length > 0) ? todayGames : results;
    let list = [...source];

    if (filterTier) list = list.filter((g: any) => {
      const s = Math.round(Number(g.score ?? 0) * 100);
      return filterTier === 'elite'    ? s >= 75 :
             filterTier === 'forte'    ? s >= 60 && s < 75 :
             filterTier === 'moderado' ? s >= 45 && s < 60 : s < 45;
    });
    if (filterLeague) list = list.filter((g: any) =>
      g.league === filterLeague
    );
    if (filterMarket) list = list.filter((g: any) => {
      const mk = filterMarket.toLowerCase();
      const mainLabel = (g.mainMarket?.label ?? '').toLowerCase();
      const comboLabels = (g.combo ?? []).map((c: any) => (c.label ?? '').toLowerCase());
      return mainLabel.includes(mk) || comboLabels.some((l: string) => l.includes(mk));
    });

    // Extrair HH:MM de strings como "22/02 15:00" ou "2026-02-22 15:00" ou "15:00"
    const extractTime = (h: string) => {
      const m = (h ?? '').match(/(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
    };

    return list.sort((a: any, b: any) =>
      sortBy === 'score'  ? Number(b.score ?? 0) - Number(a.score ?? 0) :
      sortBy === 'hora'   ? extractTime(a.hour) - extractTime(b.hour) :
      (a.league ?? '').localeCompare(b.league ?? '')
    );
  }, [todayGames, results, filterTier, filterLeague, filterMarket, sortBy]);

  return (
    <main style={{ minHeight:'100vh', background:'#0d1117',
      color:'#e6edf3', fontFamily:'system-ui,sans-serif' }}>

      <NavHeader activePage="/panorama" />

      {loading && (
        <div style={{ position:'fixed', top:0, left:0, right:0,
          height:3, background:'#58a6ff', zIndex:999 }} />
      )}

      <div style={{ padding:'28px 40px' }}>

        {/* TÍTULO */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:24, fontWeight:700, margin:'0 0 4px' }}>
            🏆 Panorama do Dia
          </h1>
          <p style={{ color:'#8b949e', margin:0, fontSize:14 }}>
            {new Date().toLocaleDateString('pt-BR', {
              weekday:'long', day:'numeric', month:'long'
            })}
          </p>
        </div>

        {/* KPI CARDS */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap',
          marginBottom:28 }}>
          {[
            {
              label: 'Lucro Hoje',
              value: `${lucroHoje >= 0 ? '+' : ''}R$ ${lucroHoje.toFixed(2)}`,
              sub: `${todayBets.length} apostas hoje`,
              color: lucroHoje >= 0 ? '#3fb950' : '#f85149',
            },
            {
              label: 'ROI Acumulado',
              value: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
              sub: `${confirmed.length} apostas confirmadas`,
              color: roi >= 0 ? '#3fb950' : '#f85149',
            },
            {
              label: 'Jogos no Banco',
              value: String(results.length),
              sub: `${(todayGames ?? []).length} hoje`,
              color: '#58a6ff',
            },
            {
              label: 'Lucro Total',
              value: `${totalProfit >= 0 ? '+' : ''}R$ ${totalProfit.toFixed(2)}`,
              sub: `Stake fixa: R$ ${STAKE_FIXA.toFixed(2)}`,
              color: totalProfit >= 0 ? '#3fb950' : '#f85149',
            },
          ].map(card => (
            <div key={card.label} style={{
              flex:1, minWidth:180,
              background:'#161b22',
              border:'1px solid #30363d',
              borderRadius:12, padding:'18px 22px',
            }}>
              <div style={{ color:'#8b949e', fontSize:13,
                marginBottom:6 }}>{card.label}</div>
              <div style={{ color:card.color, fontSize:24,
                fontWeight:700 }}>{card.value}</div>
              <div style={{ color:'#8b949e', fontSize:12,
                marginTop:4 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap',
          marginBottom:16, padding:'12px 16px',
          background:'#161b22', border:'1px solid #30363d',
          borderRadius:10 }}>

          {/* Ordenar */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color:'#8b949e', fontSize:12 }}>Ordenar:</span>
            {(['score','hora','league'] as const).map(opt => (
              <button key={opt} onClick={() => setSortBy(opt)} style={{
                background: sortBy === opt ? '#58a6ff' : 'transparent',
                color: sortBy === opt ? '#000' : '#8b949e',
                border:'1px solid #30363d',
                borderRadius:6, padding:'4px 10px',
                fontSize:12, cursor:'pointer',
              }}>
                {opt === 'score' ? '⭐ Score' :
                 opt === 'hora'  ? '🕐 Hora' : '🏆 Liga'}
              </button>
            ))}
          </div>

          {/* Tier */}
          <select value={filterTier}
            onChange={e => setFilterTier(e.target.value)}
            style={{ background:'#0d1117', color:'#e6edf3',
              border:'1px solid #30363d', borderRadius:6,
              padding:'4px 8px', fontSize:12 }}>
            <option value=''>Todos os tiers</option>
            <option value='elite'>⭐ Elite (≥75%)</option>
            <option value='forte'>✅ Forte (60-74%)</option>
            <option value='moderado'>📊 Moderado (45-59%)</option>
            <option value='fraco'>⚠️ Fraco</option>
          </select>

          {/* Liga */}
          <select value={filterLeague}
            onChange={e => setFilterLeague(e.target.value)}
            style={{ background:'#0d1117', color:'#e6edf3',
              border:'1px solid #30363d', borderRadius:6,
              padding:'4px 8px', fontSize:12, maxWidth:160 }}>
            <option value=''>Todas as ligas</option>
            {availableLeagues.map((l: string) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Mercado */}
          <select value={filterMarket}
            onChange={e => setFilterMarket(e.target.value)}
            style={{ background:'#0d1117', color:'#e6edf3',
              border:'1px solid #30363d', borderRadius:6,
              padding:'4px 8px', fontSize:12 }}>
            <option value=''>Todos os mercados</option>
            <option value='Finalizações'>🎯 Finalizações HT</option>
            <option value='Cantos HT'>📐 Cantos HT</option>
            <option value='Cantos FT'>📐 Cantos FT</option>
            <option value='Over 1.5'>⚽ Over 1.5 FT</option>
            <option value='Over 2.5'>⚽ Over 2.5 FT</option>
            <option value='Vence'>🏆 Fav Vence</option>
          </select>

          {/* Limpar */}
          {(filterTier || filterLeague || filterMarket) && (
            <button onClick={() => {
              setFilterTier('');
              setFilterLeague('');
              setFilterMarket('');
            }} style={{
              background:'transparent', color:'#f85149',
              border:'1px solid #f85149', borderRadius:6,
              padding:'4px 10px', fontSize:12, cursor:'pointer',
            }}>✕ Limpar</button>
          )}

          {/* Contador */}
          <span style={{ color:'#8b949e', fontSize:12,
            marginLeft:'auto', alignSelf:'center' }}>
            {games.length} jogo{games.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* LISTA DE JOGOS */}
        {games.length === 0 && !loading ? (
          <div style={{ textAlign:'center', padding:'60px 0',
            color:'#8b949e' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:600,
              marginBottom:8 }}>
              Nenhum jogo carregado
            </div>
            <div style={{ fontSize:13, marginBottom:20 }}>
              Vá para o Admin e carregue o CSV do dia
            </div>
            <button onClick={() => router.push('/admin')}
              style={{ background:'#58a6ff', color:'#000',
                border:'none', borderRadius:8,
                padding:'10px 24px', cursor:'pointer',
                fontWeight:700, fontSize:14 }}>
              ⚙️ Ir para Admin
            </button>
          </div>
        ) : (
          <div>
            {games.map((game: any, i: number) => (
              <GameCard key={game.id ?? i} game={game} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
