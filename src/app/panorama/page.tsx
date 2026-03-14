'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '../../components/NavHeader';
import { C } from '../../components/ui';
import { useBacktest, STAKE_FIXA } from '../../hooks/useBacktest';
import { supabase } from '../../lib/supabase';
import { analyzeLiveMultiplesAsync } from '../../lib/pre-live-multiple-analyzer';
import { ProfileBadge, PoisonBadges, FavoritoBar, KPI as KpiCard, EmptyState } from '../../components/ui';

// Estado da data selecionada (default = hoje)
const today = new Date();
const todayStr = today.toISOString().split('T')[0];  // YYYY-MM-DD para o input
const todayDDMM = todayStr.slice(8,10) + todayStr.slice(5,7);  // DDMM para o analyzer

function GameCard({ game }: { game: any }) {
  const score = Math.round(Number(game.score ?? 0) * 100);
  const tier = score >= 75 ? { icon: '⭐', label: 'Elite', color: '#f0c040' } :
              score >= 60 ? { icon: '✅', label: 'Forte', color: '#3fb950' } :
              score >= 45 ? { icon: '📊', label: 'Moderado', color: '#58a6ff' } :
              { icon: '⚠️', label: 'Fraco', color: '#f85149' };

  // Helper para formatar odds
  const formatOdd = (odd: number, source?: string) => {
    if (source === 'api-real' || source === 'csv') {
      return odd ? `@ ${odd.toFixed(2)}` : '—';
    }
    return '— (verificar na casa)';
  };

  // Calcular EV (Expected Value)
  const calcEV = (odd: number, prob: number) => {
    if (!odd || !prob) return 0;
    return (odd * prob) - 1; // Retorna valor decimal (0.087 = 8.7%)
  };

  // Preparar linhas para árvore com EV
  const allLines = [
    game.mainMarket,
    ...(game.combo || []),
    ...(game.patternLines || [])
  ].filter(Boolean).map(line => ({
    ...line,
    ev: calcEV(line.odd, line.hitRate || line.prob)
  }));

  const mainLine = allLines[0];
  const diversification = allLines.slice(1, 4);

  if (!mainLine) return null;

  // Badge EV component
  const EVBadge = ({ ev }: { ev: number }) => {
    if (ev <= 0.05) return null; // Só mostrar EV > 5%
    
    const evPct = Math.round(ev * 100);
    const isHigh = ev > 0.20; // >20%
    
    return (
      <span className="ev-badge" style={{
        background: isHigh ? '#3fb950' : '#58a6ff',
        color: 'white',
        borderRadius: 4,
        padding: '1px 4px',
        fontWeight: 600,
        fontSize: 10,
        marginLeft: 4
      }}>
        +{evPct}%
      </span>
    );
  };

  return (
    <div className={`game-tree-card ${tier.label.toLowerCase()}`} style={{ 
      background: '#0d1117', 
      borderColor: tier.color,
      borderRadius: 12, padding: '16px', marginBottom: 12,
      border: '1px solid',
      transition: 'all 0.2s'
    }}>
      {/* HEADER COMPACTO */}
      <div className="tree-header" style={{ 
        display: 'flex', justifyContent: 'space-between', marginBottom: 8 
      }}>
        <div>
          <span style={{ color: tier.color, fontWeight: 700, fontSize: 14 }}>
            {tier.icon} {tier.label} {score}%
          </span>
          <span style={{ color: '#8b949e', fontSize: 12, marginLeft: 8 }}>
            {Math.round((game.confidence ?? 0) * 100)}% conf.
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: '#8b949e', fontSize: 12 }}>{game.hour}</span>
          <div style={{ fontSize: 13, color: '#8b949e' }}>{game.league}</div>
        </div>
      </div>

      <div style={{ fontWeight: 600, marginBottom: 4 }}>{game.match}</div>

      {/* 🆕 TAGS DE PERFIL */}
      <div style={{ marginBottom: 6 }}>
        {game.profile === 'generic' && (
          <span className="bg-gray-800 text-gray-400 text-xs px-2 py-1 rounded border border-gray-700">
            💤 Sem Narrativa Clara
          </span>
        )}
        {game.profile === 'low_goals' && (
          <span className="bg-orange-900 text-orange-300 text-xs px-2 py-1 rounded border border-orange-800">
            🔒 Tendência Under
          </span>
        )}
        {game.profile === 'dominant' && (
          <span className="bg-red-900 text-red-300 text-xs px-2 py-1 rounded border border-red-800">
            🔥 Dominância Absoluta
          </span>
        )}
        {game.profile === 'chutes_ht_fav' && (
          <span className="bg-yellow-900 text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-800">
            🎯 Pressão HT
          </span>
        )}
        {game.profile === 'balanced_btts' && (
          <span className="bg-purple-900 text-purple-300 text-xs px-2 py-1 rounded border border-purple-800">
            💜 Ambas Marcam
          </span>
        )}
        {game.profile === 'high_offense_balanced' && (
          <span className="bg-green-900 text-green-300 text-xs px-2 py-1 rounded border border-green-800">
            ⚡ Alta Ofensiva
          </span>
        )}
        {game.profile === 'shootout_btts' && (
          <span className="bg-indigo-900 text-indigo-300 text-xs px-2 py-1 rounded border border-indigo-800">
            🔥 Tiroteio
          </span>
        )}
        {game.profile === 'corner_dominant' && (
          <span className="bg-blue-900 text-blue-300 text-xs px-2 py-1 rounded border border-blue-800">
            🚩 Cantos
          </span>
        )}
      </div>

      {/* MERCADO PRINCIPAL */}
      <div className="principal-market" style={{
        background: '#3fb950', color: 'white', padding: '8px 12px',
        borderRadius: 6, fontSize: 13, fontWeight: 500, marginBottom: 8,
        fontFamily: 'monospace'
      }}>
        🏠 {mainLine.label} 
        <span style={{ float: 'right' }}>
          {formatOdd(mainLine.odd, mainLine.source)}
          <EVBadge ev={mainLine.ev} />
          {game.mainMarket?.status === 'APPROVED' && (
            <span style={{ background: '#3fb950', color: 'white',
              fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>
              ✓ APPROVED +{game.mainMarket.edgePct?.toFixed(1)}%
            </span>
          )}
          {game.mainMarket?.status === 'REVIEW' && (
            <span style={{ background: '#f0c040', color: 'black',
              fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>
              ~ REVIEW
            </span>
          )}
          {game.mainMarket?.status === 'FALLBACK' && (
            <span style={{ color: '#8b949e', fontSize: 10, marginLeft: 6 }}>
              legacy
            </span>
          )}
        </span>
      </div>

      {/* ÁRVORE DIVERSIFICAÇÃO */}
      <div className="tree-diversificacao">
        <div style={{ fontWeight: 500, marginBottom: 4, color: '#f0c040' }}>
          📊 DIVERSIFICAÇÃO:
        </div>
        {diversification.map((line: any, i: number) => (
          <div key={i} className="tree-line" style={{ 
            fontSize: 12, paddingLeft: i === 0 ? 0 : 16, marginBottom: 2,
            borderLeft: i > 0 ? '2px solid #30363d' : 'none',
            fontFamily: 'Courier New, monospace'
          }}>
            {i === 0 ? '┌───' : (i < diversification.length - 1 ? '├───' : '└───')} 
            {' '}{line.label} 
            <span style={{ float: 'right', marginLeft: 8 }}>
              {formatOdd(line.odd, line.source)}
              {line.hitRate && ` ${Math.round(line.hitRate)}%`}
              <EVBadge ev={line.ev} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PanoramaPage() {
  const router = useRouter();
  const { results, summary, loading, todayGames, lastCsvText } = useBacktest();

  // 🆕 Verificação de versão para evitar cache antigo
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentVersion = '2026-03-14-v2'; // Incrementar quando mudar o código
      const storedVersion = sessionStorage.getItem('panorama-version');
      
      if (storedVersion !== currentVersion) {
        console.log('[PANORAMA] Versão atualizada, forçando reload...');
        sessionStorage.setItem('panorama-version', currentVersion);
        window.location.reload();
        return;
      }
    }
  }, []);

  // Estado da data selecionada (default = hoje)
  const [selectedDate, setSelectedDate] = useState(todayStr);
  
  // Converter YYYY-MM-DD → DDMM para o analyzer
  const selectedDDMM = selectedDate.slice(8,10) + selectedDate.slice(5,7);

  // 🆕 Processar jogos NS com Cantos FT (mantido para compatibilidade)
  const [nsGames, setNsGames] = useState<any[]>([]);
  const [processingNs, setProcessingNs] = useState(false);

  // Limpar jogos NS quando a data mudar
  useEffect(() => {
    setNsGames([]);
    setProcessingNs(false);
  }, [selectedDate]);

  // 🆕 Fonte única: lucrativo_games
  const [panoramaGames, setPanoramaGames] = useState<any[]>([]);

  useEffect(() => {
    async function loadPanoramaGames() {
      const { data, error } = await supabase
        .from('lucrativo_games')
        .select('*')
        .eq('date', selectedDate)
        .order('imported_at', { ascending: false });

      if (error) {
        console.warn('[PANORAMA] Erro no banco:', error);
        return; // Fallback silencioso
      }

      setPanoramaGames(data || []);
      console.log(`[PANORAMA] ${data?.length || 0} jogos carregados da tabela única`);
    }

    loadPanoramaGames();
  }, [selectedDate]);

  // Total de jogos no CSV para stats
  const csvGamesCount = lastCsvText ? lastCsvText.split('\n').filter(line => line.trim()).length - 1 : 0;

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
    const source = panoramaGames?.length > 0 ? panoramaGames : (todayGames ?? results);
    return Array.from(new Set(source.map((g: any) =>
      g.league).filter(Boolean))).sort();
  }, [panoramaGames, todayGames, results]);

  // Jogos filtrados e ordenados
  const games = useMemo(() => {
    let list: any[];

    if (selectedDate !== todayStr && panoramaGames.length > 0) {
      // CASO 1: Data futura → usar panoramaGames (tabela única)
      list = [...panoramaGames];

    } else if (selectedDate === todayStr) {
      // CASO 2: Hoje → priorizar panoramaGames (tabela única)
      if (panoramaGames.length > 0) {
        // panoramaGames tem os jogos de hoje da tabela única — usar direto
        list = [...panoramaGames];
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
  }, [panoramaGames, todayGames, results, selectedDate, filterTier, filterLeague, filterMarket, sortBy]);

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
              color: '#f85149',
            }] : [])
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

        {/* HEADER ÁRVORE */}
        <div className="panorama-header" style={{ 
          marginBottom:16, padding:'12px 16px',
          background:'#161b22', border:'1px solid #30363d',
          borderRadius:10 
        }}>
          <div className="stats" style={{ 
            fontSize:14, fontWeight:600, color:'#f0c040', marginBottom:8 
          }}>
            ⭐ Jogos do Dia — {panoramaGames.length}/{csvGamesCount} qualificados (Tabela Única)
          </div>
          <div className="stats-bar" style={{ 
            display:'flex', gap:16, marginBottom:12,
            fontSize:12, color:'#8b949e' 
          }}>
            <div>Lucro Hoje: <strong style={{color:'#3fb950'}}>+R$ 0.00</strong> (0 apostas)</div>
            <div>ROI Acumulado: <strong style={{color:'#3fb950'}}>+10.6%</strong> (229 confirmadas)</div>
            <div>Banco: <strong style={{color:'#58a6ff'}}>312 jogos</strong></div>
          </div>
          <div className="filters" style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{
              background:'#0d1117', color:'#e6edf3', border:'1px solid #30363d',
              borderRadius:6, padding:'4px 8px', fontSize:12
            }}>
              <option value=''>Todos os tiers</option>
              <option value='elite'>⭐ Elite (≥75%)</option>
              <option value='forte'>✅ Forte (60-74%)</option>
              <option value='moderado'>📊 Moderado (45-59%)</option>
            </select>
            <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} style={{
              background:'#0d1117', color:'#e6edf3', border:'1px solid #30363d',
              borderRadius:6, padding:'4px 8px', fontSize:12, maxWidth:160
            }}>
              <option value=''>Todas as ligas</option>
              {availableLeagues.map((l: string) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as 'score' | 'hora' | 'league')} style={{
              background:'#0d1117', color:'#e6edf3', border:'1px solid #30363d',
              borderRadius:6, padding:'4px 8px', fontSize:12
            }}>
              <option value='score'>⭐ Score</option>
              <option value='hora'>⏰ Hora</option>
              <option value='league'>🏆 Liga</option>
            </select>
            <span style={{ color:'#8b949e', fontSize:12, marginLeft:'auto', alignSelf:'center' }}>
              {games.length} jogo{games.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* LISTA DE JOGOS - GRID RESPONSIVO */}
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
          <div className="games-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 12
          }}>
            {games.map((game: any, i: number) => (
              <GameCard key={game.id ?? i} game={game} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
