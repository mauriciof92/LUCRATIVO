'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBacktest, STAKE_FIXA } from '../../hooks/useBacktest';
import { analyzeLiveMultiplesAsync } from '../../lib/pre-live-multiple-analyzer';
import { NavHeader } from '../../components/NavHeader';
import { ProfileBadge, PoisonBadges, FavoritoBar, KPI as KpiCard, C, EmptyState } from '../../components/ui';

// Estado da data selecionada (default = hoje)
const today = new Date();
const todayStr = today.toISOString().split('T')[0];  // YYYY-MM-DD para o input
const todayDDMM = todayStr.slice(8,10) + todayStr.slice(5,7);  // DDMM para o analyzer

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

  // ── 1. DADOS BRUTOS (main + combo deduplicado) ────────────────────────
  const mainLine = game.mainMarket ? {
    label: game.mainMarket.label,
    odd: game.mainMarket.odd,
    prob: game.mainMarket.hitRate,
    minOdd: game.mainMarket.minOdd,
    source: game.mainMarket.source,
  } : null

  // Deduplicar combo: remover labels idênticos, manter maior prob
  const dedupedComboLines = (game.combo || [])
    .filter((c: any) => c.label && c.hitRate != null)
    .reduce((acc: any[], curr: any) => {
      const existing = acc.find(l => l.label === curr.label)
      if (!existing || curr.hitRate > existing.hitRate) {
        if (existing) {
          const idx = acc.indexOf(existing)
          acc[idx] = curr
        } else {
          acc.push(curr)
        }
      }
      return acc
    }, [])
    .map((c: any) => ({
      label: c.label,
      odd: c.odd,
      prob: c.hitRate,
      minOdd: c.minOdd,
      source: c.source,
    }))

  // ── 2. MAIOR PROBABILIDADE (em vez de ranking por EV) ─────────────────
  const allLines = [...(mainLine ? [mainLine] : []), ...dedupedComboLines]
    .filter(l => l.prob !== null)
    .sort((a, b) => b.prob - a.prob) // Ordenar por hitRate decrescente

  const bestProb = allLines[0] ?? null

  // ── 3. BARRA VISUAL DE PROBABILIDADE ────────────────────────────────
  const ProbBar = ({ prob }: { prob: number }) => (
    <div style={{
      height: 4, borderRadius: 2,
      background: `linear-gradient(to right,
        #3fb950 ${prob*100}%,
        #21262d ${prob*100}%)`
    }} />
  )

  // 🆕 Helper para formatação de odds com regras estritas
  const formatOdd = (odd: number, source: string | null) => {
    if (!source || source === 'estimated' || source === 'fallback') {
      return '— (verificar na casa)';
    }
    return `@ ${Number(odd).toFixed(2)}`;
  };

  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${tier === 'elite' ? '#f0c040' :
                            tier === 'forte' ? '#3fb950' : '#30363d'}`,
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 12,
    }}>

      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:6 }}>
        <span style={{ color:'#8b949e', fontSize:13 }}>
          🕐 {(game.hour ?? '').replace(/^\d{2}\/\d{2}\s*/, '')} · {game.league}
        </span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {game.profile && <ProfileBadge profile={game.profile} />}
          {game.poison?.isPoison && <PoisonBadges poison={game.poison} />}
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

      {/* ── 🎯 MAIOR PROBABILIDADE ─── */}
      {bestProb && (
        <div style={{ background: '#1c2128', border: '1px solid #58a6ff',
          borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#58a6ff', fontWeight: 700,
            marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            🎯 Maior Probabilidade
          </div>
          <div style={{ fontSize: 14, color: '#e6edf3', marginBottom: 4, fontWeight: 600 }}>
            {bestProb.label}
          </div>
          <ProbBar prob={bestProb.prob} />
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
            {(bestProb.prob * 100).toFixed(0)}% histórico
            {bestProb.source === 'api-real' ? (
              <span style={{ color: '#3fb950', marginLeft: 8 }}>
                {formatOdd(bestProb.odd, bestProb.source)} ✅ EV +{((bestProb.prob * bestProb.odd) - 1).toFixed(0)}%
              </span>
            ) : (
              <span style={{ color: '#8b949e', marginLeft: 8 }}>
                {formatOdd(bestProb.odd, bestProb.source)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── COMPLEMENTARES ─── */}
      {dedupedComboLines.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: 1 }}>
            Complementares
          </div>
          {dedupedComboLines
            .sort((a: any, b: any) => b.prob - a.prob) // Ordenar por prob decrescente
            .map((line: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center',
              gap: 8, padding: '7px 10px', background: '#161b22',
              borderRadius: 6, border: '1px solid #30363d', marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#e6edf3', marginBottom: 2 }}>
                  {line.label}
                </div>
                <ProbBar prob={line.prob} />
                <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                  {(line.prob * 100).toFixed(0)}% histórico
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#8b949e', textAlign: 'right' }}>
                {line.source === 'api-real' ? (
                  <>
                    <div>{formatOdd(line.odd, line.source)}</div>
                    <div style={{ color: '#3fb950' }}>
                      ✅ EV +{((line.prob * line.odd) - 1).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <div>{formatOdd(line.odd, line.source)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PADRÕES ESTRATÉGICOS ─── */}
      {game.patternLines?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#f0c040', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: 1 }}>
            🎯 Padrões Estratégicos
          </div>
          {game.patternLines
            .sort((a: any, b: any) => b.prob - a.prob) // Ordenar por prob decrescente
            .map((line: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center',
              gap: 8, padding: '7px 10px', background: '#1c2128',
              borderRadius: 6, border: '1px solid #f0c040', marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#e6edf3', marginBottom: 2 }}>
                  {line.label}
                </div>
                <ProbBar prob={line.hitRate ?? line.prob} />
                <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                  {((line.hitRate ?? line.prob) * 100).toFixed(0)}% histórico
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#8b949e', textAlign: 'right' }}>
                {line.source === 'api-real' ? (
                  <>
                    <div>{formatOdd(line.odd, line.source)}</div>
                    <div style={{ color: '#3fb950' }}>
                      ✅ EV +{(((line.hitRate ?? line.prob) * line.odd) - 1).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <div>{formatOdd(line.odd, line.source)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* POISON TRIGGERS */}
      <PoisonBadges poison={game.poison} />

      {/* STATS CHAVE DO FAVORITO */}
      <FavoritoBar fav={game.favorito} />
    </div>
  );
}

export default function PanoramaPage() {
  const router = useRouter();
  const { results, summary, loading, todayGames, lastCsvText } = useBacktest();

  // Estado da data selecionada (default = hoje)
  const [selectedDate, setSelectedDate] = useState(todayStr);
  
  // Converter YYYY-MM-DD → DDMM para o analyzer
  const selectedDDMM = selectedDate.slice(8,10) + selectedDate.slice(5,7);

  // 🆕 Processar jogos NS com Cantos FT
  const [nsGames, setNsGames] = useState<any[]>([]);
  const [processingNs, setProcessingNs] = useState(false);

  // Limpar jogos NS quando a data mudar
  useEffect(() => {
    setNsGames([]);
    setProcessingNs(false);
  }, [selectedDate]);

  // Processar jogos NS quando lastCsvText estiver disponível
  useEffect(() => {
    if (!lastCsvText) return;
    if (!lastCsvText || lastCsvText.trim() === '') return;
    // Removido: if (nsGames.length > 0) return; // Permitir reprocessamento quando data mudar

    setProcessingNs(true);
    (async () => {
      try {
        console.log('[PANORAMA] Buscando odds reais (compartilhando cache com Múltiplas)...');
        
        // 1. Buscar odds (virá do cache se já foi buscado antes)
        const today = new Date().toISOString().split('T')[0];
        const oddsRes = await fetch('/api/football-odds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText: lastCsvText, date: today }),
        });
        
        const { oddsMap, fixtureMap } = oddsRes.ok 
          ? await oddsRes.json() 
          : { oddsMap: {}, fixtureMap: {} }; // fallback silencioso
        
        console.log(`[PANORAMA] Odds recebidas: ${Object.keys(oddsMap || {}).length} com odds reais`);
        
        // 2. Passar para o analyzer (igual às Múltiplas)
        console.log('[PANORAMA] Processando jogos NS com odds reais...');
        const analysis = await analyzeLiveMultiplesAsync(
          lastCsvText, 
          oddsMap, 
          fixtureMap, 
          [], 
          selectedDDMM,
          'panorama'
        );
        
        setNsGames(analysis.games ?? []); // ← guardar jogos completos do analyzer
        console.log(`[PANORAMA] ${analysis.games?.length || 0} jogos NS processados com Cantos FT + odds reais`);
      } catch (error) {
        console.error('[PANORAMA] Erro ao processar jogos NS:', error);
        // Fallback: processar sem odds reais
        try {
          console.log('[PANORAMA] Fallback: processando sem odds reais...');
          const analysis = await analyzeLiveMultiplesAsync(lastCsvText, undefined, undefined, [], selectedDDMM, 'panorama');
          setNsGames(analysis.games ?? []);
          console.log(`[PANORAMA] ${analysis.games?.length || 0} jogos NS processados (fallback sem odds)`);
        } catch (fallbackError) {
          console.error('[PANORAMA] Erro no fallback:', fallbackError);
        }
      } finally {
        setProcessingNs(false);
      }
    })();
  }, [lastCsvText, selectedDDMM]);

  // Filtros locais — NÃO buscam dado, apenas filtram o que já está carregado
  const [filterTier, setFilterTier]     = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [filterMarket, setFilterMarket] = useState('');
  const [sortBy, setSortBy]             = useState<'score'|'hora'|'league'>('score');

  const today = new Date().toISOString().split('T')[0];

  // KPIs
  const selectedDayBets = results.filter(r => {
    const d = (r.hour ?? '').split(' ')[0];
    return d === selectedDate &&
      (r.mainMarket.result === 'win' || r.mainMarket.result === 'lose');
  });
  const lucroDia = selectedDayBets.reduce(
    (acc, r) => acc + Number(r.mainMarket.profit ?? 0), 0
  );
  // PROPOSTO — "avg" e "no-odd" viram uma categoria explícita "não resolvido"
  const confirmed = results.filter(r =>
    r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'
  );
  const unresolved = results.filter(r =>
    r.mainMarket.result === 'avg' || r.mainMarket.result === 'no-odd'
  );
  const totalProfit = confirmed.reduce(
    (acc, r) => acc + Number(r.mainMarket.profit ?? 0), 0
  );
  const roi = confirmed.length > 0
    ? (totalProfit / (confirmed.length * STAKE_FIXA)) * 100
    : 0;

  // Ligas e mercados únicos para os selects de filtro
  const availableLeagues = useMemo(() => {
    const source = nsGames?.length > 0 ? nsGames : (todayGames ?? results);
    return Array.from(new Set(source.map((g: any) =>
      g.league).filter(Boolean))).sort();
  }, [nsGames, todayGames, results]);

  // Jogos filtrados e ordenados
  const games = useMemo(() => {
    let list: any[];

    if (selectedDate !== todayStr && nsGames.length > 0) {
      // CASO 1: Data futura → analyzer é a fonte (CSV filtrado por selectedDDMM)
      list = [...nsGames];

    } else if (selectedDate === todayStr) {
      // CASO 2: Hoje → priorizar nsGames processados pelo analyzer
      if (nsGames.length > 0) {
        // nsGames tem os jogos de hoje processados pelo analyzer — usar direto
        list = [...nsGames];
      } else {
        // fallback: DB sem analyzer
        const baseMap = new Map<string, any>();
        const dbList = todayGames.length > 0 ? todayGames : results;
        dbList.forEach((g: any) => {
          const key = g.match || `${g.home} x ${g.away}`;
          baseMap.set(key, g);
        });
        list = Array.from(baseMap.values());
      }

    } else {
      // CASO 3: Data passada → filtrar results pelo dia selecionado
      // selectedDate está em YYYY-MM-DD, g.hour pode ser "DD-MM-YYYY HH:MM"
      list = results.filter((g: any) => {
        const raw = g.hour ?? '';
        // Tenta extrair DD-MM-YYYY do campo hour
        const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (m) {
          const gameDate = `${m[3]}-${m[2]}-${m[1]}`; // converte para YYYY-MM-DD
          return gameDate === selectedDate;
        }
        return false;
      });
    }

    // 🆕 FILTRAR JOGOS QUE JÁ COMEÇARAM (apenas para hoje)
    if (selectedDate === todayStr) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      // Extrair HH:MM de strings como "22/02 15:00" ou "2026-02-22 15:00" ou "15:00"
      const extractTime = (h: string) => {
        const m = (h ?? '').match(/(\d{1,2}):(\d{2})/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
      };
      
      const isGameStarted = (game: any) => {
        const raw = game.hour ?? '';
        // Tentar parse de "DD-MM-YYYY HH:MM"
        const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
        if (!match) return false;
        
        const [, day, month, year, hh, mm] = match;
        const gameDateTime = new Date(
          Number(year), Number(month) - 1, Number(day),
          Number(hh), Number(mm)
        );
        
        // Só considerar iniciado se a data+hora do jogo já passou
        return gameDateTime <= new Date();
      };
      
      list = list.filter((g: any) => !isGameStarted(g));
    }

    if (filterTier) list = list.filter((g: any) => {
      const s = Math.round(Number(g.score ?? 0) * 100);
      return filterTier === 'elite'    ? s >= 75 :
             filterTier === 'forte'    ? s >= 60 && s < 75 :
             filterTier === 'moderado' ? s >= 45 && s < 60 : s < 45;
    });
    if (filterLeague) list = list.filter((g: any) =>
      g.league === filterLeague
    );
    if (filterMarket) {
      const mk = filterMarket.toLowerCase();
      
      list = list.filter((g: any) => {
        const mainLabel    = (g.mainMarket?.label ?? '').toLowerCase();
        const comboLabels  = (g.combo ?? []).map((c: any) => (c.label ?? '').toLowerCase());
        const patternLabels = (g.patternLines ?? []).map((p: any) => (p.label ?? '').toLowerCase());
        const extraLabels  = (g.extraMarkets ?? []).map((e: any) => (e.label ?? '').toLowerCase());
        
        return mainLabel.includes(mk)
          || comboLabels.some((l: string) => l.includes(mk))
          || patternLabels.some((l: string) => l.includes(mk))
          || extraLabels.some((l: string) => l.includes(mk));
      });
      
      // Reordenar quando filtro ativo
      list = list.sort((a: any, b: any) => {
        const rank = (g: any): number => {
          const mainLabel = (g.mainMarket?.label ?? '').toLowerCase();
          if (mainLabel.includes(mk)) return 0;  // mercado principal = topo
          const comboLabels = (g.combo ?? []).map((c: any) => (c.label ?? '').toLowerCase());
          if (comboLabels.some((l: string) => l.includes(mk))) return 1; // combo = meio
          return 2; // patternLines/extra = fim
        };
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        // Desempate por score
        return Number(b.score ?? 0) - Number(a.score ?? 0);
      });
    }

    // Funções auxiliares (fora do if para uso no sort)
    const extractTime = (h: string) => {
      const m = (h ?? '').match(/(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
    };

    return list.sort((a: any, b: any) =>
      sortBy === 'score'  ? Number(b.score ?? 0) - Number(a.score ?? 0) :
      sortBy === 'hora'   ? extractTime(a.hour) - extractTime(b.hour) :
      (a.league ?? '').localeCompare(b.league ?? '')
    );
  }, [nsGames, todayGames, results, selectedDate, filterTier, filterLeague, filterMarket, sortBy]);

  const isToday = selectedDate === todayStr;

  return (
    <main style={{ minHeight:'100vh', background:'#0d1117',
      color:'#e6edf3', fontFamily:'system-ui,sans-serif' }}>

      <NavHeader activePage="/panorama" />

      {loading && (
        <div style={{ position:'fixed', top:0, left:0, right:0,
          height:3, background:'#58a6ff', zIndex:999 }} />
      )}

      <div style={{ padding:'28px 40px' }}>

        {/* TÍTULO E SELETOR DE DATA */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h1 style={{ fontSize:24, fontWeight:700, margin:'0 0 4px' }}>
                🏆 Panorama do Dia
              </h1>
              <p style={{ color:'#8b949e', margin:0, fontSize:14 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday:'long', day:'numeric', month:'long'
                })}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Data:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={e => {
                  // Manter YYYY-MM-DD para o estado
                  setSelectedDate(e.target.value);
                }}
                style={{
                  background: C.card,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              />
              {selectedDate !== todayStr && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  style={{ fontSize: 11, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  Voltar para hoje
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI CARDS */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap',
          marginBottom:28 }}>
          {[
            {
              label: isToday ? 'Lucro Hoje' : `Lucro Dia ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
              value: `${lucroDia >= 0 ? '+' : ''}R$ ${lucroDia.toFixed(2)}`,
              sub: `${selectedDayBets.length} apostas ${isToday ? 'hoje' : 'no dia'}`,
              color: lucroDia >= 0 ? '#3fb950' : '#f85149',
            },
            {
              label: 'ROI Acumulado',
              value: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
              sub: `${confirmed.length} confirmadas`,
              color: roi >= 0 ? '#3fb950' : '#f85149',
            },
            ...(unresolved.length > 0 ? [{
              label: 'Não Resolvidos',
              value: String(unresolved.length),
              sub: `${unresolved.filter(r => r.mainMarket.result === 'avg').length} avg + ${unresolved.filter(r => r.mainMarket.result === 'no-odd').length} no-odd`,
              color: '#f0c040',
            }] : []),
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
