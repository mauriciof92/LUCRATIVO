import { useState, useEffect } from "react";
import { runBacktest, enrichWithRealStats, validateWithManualInput, type BetResult } from "../lib/backtest";
import { loadStoredBacktest, saveStoredBacktest, type StoredBacktest } from "../lib/storage";
import { fetchRealStatsForMatches, fetchFixtureStatistics } from "../lib/footballApi";
import { parseCSV } from "../engine";
import { supabase } from "../lib/supabase";

// 🆕 CONSTANTE GLOBAL - STAKE FIXA R$ 25,00
export const STAKE_FIXA = 25.00;

const C = {
  bg:"#0a0f1f", card:"#1e293b", border:"#374151", accent:"#3b82f6",
  green:"#10b981", red:"#ef4444", yellow:"#f59e0b", gray:"#6b7280",
  text:"#f9fafb", muted:"#9ca3af",
};

type BetStatus = "win"|"lose"|"push"|"no-odd"|"avg"|"pending_manual";

function Badge({ result }: { result: BetStatus }) {
  const map: Record<BetStatus, [string,string,string,string]> = {
    win:     ["✅ Verde",    "#052e16", C.green, "Aposta vencedora"],
    lose:    ["❌ Vermelho", "#450a0a", C.red, "Aposta perdida"],
    push:    ["🟡 Push",    "#422006", C.yellow, "Empate técnico — stake devolvida"],
    "no-odd":["— Void",    "#1f2937", C.gray, "Sem odd disponível no CSV"],
    avg:     ["📊 Média",   "#1e1b4b", "#818cf8", "Sem dados reais HT — resultado baseado em média histórica, não conta como win nem lose"],
    "pending_manual": ["⚠️ Pendente", "#451a03", "#f59e0b", "Aguardando dados reais para resolver"],
  };
  const [label, bg, color, tooltip] = map[result] ?? map["no-odd"];
  return <span title={tooltip} style={{background:bg,color,border:`1px solid ${color}40`,borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:600,whiteSpace:"nowrap",cursor:"help"}}>{label}</span>;
}

function KPI({ label, value, color }: { label:string; value:string; color?:string }) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px",flex:"1 1 110px",minWidth:110}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color:color??C.text}}>{value}</div>
    </div>
  );
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: "8px 10px", textAlign: "left", color: C.muted, fontWeight: 600, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>
      {children}
    </th>
  );
}

function TD({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "8px 10px", verticalAlign: "top", ...style }}>
      {children}
    </td>
  );
}

// Função auxiliar para categorizar mercados
const mktCat = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("finalizac") || l.includes("chute")) return "Finalizações HT";
  if (l.includes("canto") || l.includes("escanteio")) return "Cantos HT";
  if (l.includes("gol") || l.includes("goal")) return "Gols HT";
  return "Outros";
};

// Função auxiliar para estatísticas dos mercados
const buildMarketStats = (results: BetResult[]) => {
  const map: Record<string, any> = {};
  for (const r of results) {
    for (const b of [r.mainMarket, ...r.combo]) {
      const cat = mktCat(b.label);
      if (!map[cat]) map[cat] = { total: 0, w: 0, l: 0, p: 0, a: 0 };
      map[cat].total++;
      if (b.result === "win") map[cat].w++;
      else if (b.result === "lose") map[cat].l++;
      else if (b.result === "push") map[cat].p++;
      else if (b.result === "avg") map[cat].a++;
    }
  }
  return map;
};

export const useBacktest = () => {
  // Estados
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BetResult[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<StoredBacktest | null>(null);
  const [err, setErr] = useState<string>("");
  const [showTable, setShowTable] = useState(false);
  const [filter, setFilter] = useState<"all" | "win" | "lose" | "push" | "no-odd" | "avg">("all");
  const [enriching, setEnriching] = useState(false);
  const [reqUsed, setReqUsed] = useState(0);
  const [enrichErr, setEnrichErr] = useState<string>("");
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});

  // 🆕 FASE 5.3: Estado global para sincronização
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);

  // 🆕 FASE 5.3: Hydration automática ao carregar qualquer página
  useEffect(() => {
    async function hydrate() {
      setLoading(true);
      try {
        console.log('[HYDRATION] Iniciando busca de dados...');
        
        // 🆕 Buscar direto do Supabase (única fonte da verdade)
        const { data: betData, error } = await supabase
          .from('bet_results')
          .select(`
            *,
            combo_legs (*)
          `)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.error('[HYDRATION] Erro Supabase:', error);
          throw error;
        }

        console.log(`[HYDRATION] Supabase retornou ${betData?.length || 0} registros`);

        if (betData && betData.length > 0) {
          // Mapear colunas do Supabase para o formato BetResult do app
          const mapped: BetResult[] = betData.map(row => ({
            id: row.id,
            match: row.match,
            league: row.league ?? '',
            hour: row.hour ?? '',
            status: row.status ?? '',
            resultHome: row.result_home ?? 0,
            resultAway: row.result_away ?? 0,
            profile: row.profile ?? '',
            score: Number(row.score ?? 0),
            confidence: Number(row.confidence ?? 0),
            actualTotalShotsHT: row.actual_shots_ht ?? undefined,
            actualTotalCornersHT: row.actual_corners_ht ?? undefined,
            created_at: row.created_at ?? '',
            favorito: { lado: '', nome: '', nomeUnder: '', afFav: 0, afUnder: 0, afDiff: 0, chFavGol: 0, chFavTot: 0, chUnderGol: 0, chUnderTot: 0, cantFavHT: 0, cantUnderHT: 0, cantFavFT: 0, cantUnderFT: 0, gol05HTFav: 0, dfH: 0, dfA: 0 },
            mainMarket: {
              label: row.main_market_label ?? '',
              odd: Number(row.main_market_odd ?? 0),
              minOdd: 0,
              stake: STAKE_FIXA,
              result: row.main_market_result ?? 'no-odd',
              profit: Number(row.main_market_profit ?? 0),
              hasValue: false,
            },
            combo: (row.combo_legs ?? []).map((cl: any) => ({
              label: cl.label ?? '',
              odd: Number(cl.odd ?? 0),
              minOdd: 0,
              stake: STAKE_FIXA,
              result: cl.result ?? 'no-odd',
              profit: Number(cl.profit ?? 0),
              hasValue: false,
            })),
            ftGoals: (row.result_home ?? 0) + (row.result_away ?? 0),
          }));

          console.log(`[HYDRATION] Mapeados ${mapped.length} jogos`);

          setResults(mapped);
          setHistory({ version: "1.0.0", createdAt: new Date().toISOString(), results: mapped, summary: summary });

          // Recalcular summary
          const wins = mapped.filter(r => r.mainMarket.result === 'win').length;
          const losses = mapped.filter(r => r.mainMarket.result === 'lose').length;
          const total = wins + losses;
          const totalProfit = mapped.reduce(
            (acc, r) => acc + Number(r.mainMarket.profit || 0), 0
          );

          const newSummary = {
            totalGames: mapped.length,
            totalBets: total,
            wins,
            losses,
            hitRate: total > 0 ? (wins / total * 100) : 0,
            roi: total > 0 ? (totalProfit / (total * STAKE_FIXA) * 100) : 0,
            totalProfit,
          };
          
          setSummary(newSummary);
          setShowTable(true);

          // 🆕 Salvar no cache local para performance
          if (typeof window !== 'undefined') {
            localStorage.setItem('lucrativo-backtest-data', JSON.stringify({
              version: "1.0.0",
              createdAt: new Date().toISOString(),
              results: mapped,
              summary: newSummary
            }));
          }

          console.log(`[HYDRATION] ✅ Sucesso: ${mapped.length} jogos carregados`);
        } else {
          console.log('[HYDRATION] ❌ Nenhum dado encontrado no Supabase');
          
          // 🆕 Tentar cache local se Supabase estiver vazio
          if (typeof window !== 'undefined') {
            const cached = localStorage.getItem('lucrativo-backtest-data');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed.results?.length) {
                setResults(parsed.results);
                setSummary(parsed.summary);
                setHistory(parsed);
                setShowTable(true);
                console.log(`[HYDRATION] Cache local: ${parsed.results.length} jogos`);
              }
            }
          }
        }
      } catch (e) {
        console.error('[HYDRATION] Erro geral:', e);
        // Fallback silencioso — dados do cache já foram carregados acima
      } finally {
        setLoading(false);
      }
    }

    hydrate();
  }, []); // Roda APENAS uma vez ao montar

  // Recalcular ROI quando results muda — fórmula unificada (igual Dashboard/Panorama)
  useEffect(() => {
    if (results.length === 0) return;

    // Filtrar apenas mainMarket com resultado definitivo (win/lose)
    const confirmed = results.filter(r => r.mainMarket.result === "win" || r.mainMarket.result === "lose");
    const wins = confirmed.filter(r => r.mainMarket.result === "win").length;
    const losses = confirmed.length - wins;
    const totalProfit = confirmed.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0);
    const roi = confirmed.length > 0 ? (totalProfit / (confirmed.length * STAKE_FIXA) * 100) : 0;
    const hitRate = confirmed.length > 0 ? (wins / confirmed.length * 100) : 0;

    const newSummary = {
      totalGames: results.length,
      totalBets: confirmed.length,
      wins,
      losses,
      totalProfit,
      roi,
      hitRate,
    };

    setSummary(newSummary);

    // Salvar no storage
    const stored = loadStoredBacktest();
    saveStoredBacktest({ version: "1.0.0", createdAt: new Date().toISOString(), ...(stored ?? {}), results, summary: newSummary });

    console.log(`[ROI-RECALC] Unificado: ${confirmed.length} confirmadas, ROI=${roi.toFixed(2)}%, HitRate=${hitRate.toFixed(2)}%, Profit=R$${totalProfit.toFixed(2)}`);
  }, [results]);

  // Persistir inputs manuais no localStorage
  useEffect(() => {
    if (Object.keys(manualInputs).length > 0) {
      localStorage.setItem('backtest-manual-inputs', JSON.stringify(manualInputs));
      console.log('[MANUAL-INPUTS-SAVED] Inputs manuais salvos no localStorage:', manualInputs);
    }
  }, [manualInputs]);

  // Funções
  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setErr("");
    try {
      const text = await file.text();
      // Usar runBacktest para resolver win/lose corretamente
      const { results: backtestResults } = runBacktest(text);
      // Adicionar stake fixa a todos os resultados
      const results: BetResult[] = backtestResults.map(r => ({
        ...r,
        mainMarket: { ...r.mainMarket, stake: STAKE_FIXA, profit: r.mainMarket.result === 'win' ? (r.mainMarket.odd ?? 0) * STAKE_FIXA - STAKE_FIXA : r.mainMarket.result === 'lose' ? -STAKE_FIXA : 0 },
        combo: r.combo.map(c => ({ ...c, stake: STAKE_FIXA, profit: c.result === 'win' ? (c.odd ?? 0) * STAKE_FIXA - STAKE_FIXA : c.result === 'lose' ? -STAKE_FIXA : 0 })),
      }));
      setResults(results);
      setShowTable(true);
      console.log(`[CSV-IMPORT] ${results.length} jogos importados com resultados resolvidos`);

      // Salvar no Supabase com resultados corretos
      const upsertRows = results.map(r => ({
        id: r.id,
        match: r.match,
        league: r.league,
        hour: r.hour,
        status: r.status,
        result_home: r.resultHome,
        result_away: r.resultAway,
        profile: r.profile,
        score: r.score,
        confidence: r.confidence,
        main_market_label: r.mainMarket.label,
        main_market_odd: r.mainMarket.odd,
        main_market_result: r.mainMarket.result,
        main_market_profit: r.mainMarket.profit,
      }));
      const { error: upsertErr } = await supabase.from('bet_results').upsert(upsertRows, { onConflict: 'id' });
      if (upsertErr) console.warn('[CSV-IMPORT] Supabase upsert warning:', upsertErr.message);
      else console.log(`[CSV-IMPORT] ${upsertRows.length} jogos salvos no Supabase`);
    } catch (e: any) {
      setErr("Erro ao importar CSV: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setSummary(null);
    setShowTable(false);
    setFile(null);
    setErr("");
    setFilter("all");
    setEnriching(false);
    setEnrichErr("");
    setManualInputs({});
    localStorage.removeItem('backtest-manual-inputs');
    console.log('[CLEAR] Estado limpo');
  };

  const handleEnrich = async () => {
    if (results.length === 0) return;
    setEnriching(true);
    setEnrichErr("");
    try {
      // Chamar API route para obter stats
      const matches = results.map(r => ({
        id: parseInt(r.id),
        homeTeam: r.match.split(" x ")[0]?.trim() || "",
        awayTeam: r.match.split(" x ")[1]?.trim() || "",
        date: new Date().toISOString().split('T')[0], // Usar data atual
      }));
      
      const response = await fetch('/api/football-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matches }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch football results');
      }
      
      const { stats, reqUsed: apiReqUsed } = await response.json();
      setReqUsed(prev => prev + apiReqUsed);
      
      const enriched = await enrichWithRealStats(results, stats);
      setResults(enriched);
      console.log(`[ENRICH] ${enriched.length} jogos enriquecidos`);
      const stored = await loadStoredBacktest();
      if (stored) await saveStoredBacktest({ ...stored, results: enriched });
    } catch (e: any) {
      setEnrichErr("Erro ao buscar resultados: " + (e?.message ?? String(e)));
    } finally {
      setEnriching(false);
    }
  };

  // 🆕 FASE 5.3: Scanner automático de jogos do dia
  const fetchTodayGames = async () => {
    try {
      setIsGlobalSyncing(true);
      console.log('[TODAY-GAMES] Buscando jogos do dia...');
      
      const response = await fetch(`/api/football-results?date=${new Date().toISOString().split('T')[0]}`);
      if (!response.ok) {
        throw new Error('Falha ao buscar jogos do dia');
      }
      
      const data = await response.json();
      console.log(`[TODAY-GAMES] ${data.count || 0} jogos encontrados`);
      
      // TODO: Implementar lógica para converter fixtures em BetResult
      // e aplicar filtros de elite
      
    } catch (error) {
      console.error('[TODAY-GAMES] Erro:', error);
      setErr("Erro ao buscar jogos do dia: " + (error as any)?.message);
    } finally {
      setIsGlobalSyncing(false);
    }
  };

  // 🆕 FASE 5.3: Sincronização global com feedback visual
  const syncMissingResults = async () => {
    try {
      setIsGlobalSyncing(true);
      console.log('[SYNC-MISSING] Iniciando sincronização de resultados faltantes...');
      
      const stored = await loadStoredBacktest();
      if (!stored || !stored.results) {
        console.log('[SYNC-MISSING] Nenhum resultado encontrado para sincronizar');
        return;
      }

      // Identificar jogos que precisam de dados HT
      const missingHTResults = stored.results.filter((r: any) => {
        const fixtureId = parseInt(r.id);
        if (isNaN(fixtureId) || fixtureId <= 0) return false;
        
        const hasShotsHT = r.actualTotalShotsHT !== undefined && r.actualTotalShotsHT > 0;
        const hasCornersHT = r.actualTotalCornersHT !== undefined && r.actualTotalCornersHT > 0;
        
        const hasHTMarkets = r.mainMarket.label.includes('HT') || 
                           r.combo.some((m: any) => m.label.includes('HT'));
        
        return hasHTMarkets && (!hasShotsHT || !hasCornersHT);
      });

      console.log(`[SYNC-MISSING] ${missingHTResults.length} jogos precisam de dados HT`);

      if (missingHTResults.length === 0) {
        console.log('[SYNC-MISSING] Todos os jogos já estão sincronizados');
        return;
      }

      // Buscar dados em lote (com cache inteligente)
      const syncPromises = missingHTResults.map(async (result: any) => {
        const fixtureId = parseInt(result.id);
        
        try {
          const cacheKey = `fixture_stats_${fixtureId}`;
          const cached = localStorage.getItem(cacheKey);
          
          if (cached) {
            const cachedData = JSON.parse(cached);
            const cacheAge = Date.now() - cachedData.timestamp;
            if (cacheAge < 24 * 60 * 60 * 1000) {
              console.log(`[SYNC-CACHE] Usando cache para fixture ${fixtureId}`);
              return { fixtureId, stats: cachedData.stats, result };
            }
          }

          console.log(`[SYNC-API] Buscando dados para fixture ${fixtureId}`);
          const response = await fetch(`/api/football-results?fixtureId=${fixtureId}`);
          
          if (!response.ok) {
            console.warn(`[SYNC-API] Falha ao buscar fixture ${fixtureId}: ${response.status}`);
            return null;
          }

          const stats = await response.json();
          
          localStorage.setItem(cacheKey, JSON.stringify({
            stats,
            timestamp: Date.now()
          }));

          return { fixtureId, stats, result };
        } catch (error) {
          console.error(`[SYNC-ERROR] Erro ao sincronizar fixture ${fixtureId}:`, error);
          return null;
        }
      });

      const syncResults = await Promise.all(syncPromises);
      const validResults = syncResults.filter(r => r !== null);

      if (validResults.length === 0) {
        console.log('[SYNC-MISSING] Nenhum dado válido obtido');
        return;
      }

      // Atualizar resultados com novos dados
      const updatedResults = stored.results.map((result: any) => {
        const syncData = validResults.find((r: any) => r?.fixtureId === parseInt(result.id));
        if (!syncData) return result;

        const { stats } = syncData;
        
        return {
          ...result,
          actualTotalShotsHT: stats.shotsHTHome + stats.shotsHTAway,
          actualTotalCornersHT: stats.cornersHTHome + stats.cornersHTAway,
          shotsHTSource: stats.shotsHTSource,
          cornersSource: stats.cornersSource,
        };
      });

      await saveStoredBacktest({ ...stored, results: updatedResults });
      setResults(updatedResults);
      
      console.log(`[SYNC-MISSING] ${validResults.length} jogos sincronizados com sucesso`);
    } catch (error) {
      console.error('[SYNC-MISSING] Erro na sincronização:', error);
    } finally {
      setIsGlobalSyncing(false);
    }
  };

  const handleManualInput = (resultId: string, value: string, isShots: boolean) => {
    const idStr = String(resultId);
    console.log(`[INPUT-EVENT] Teclado detectado:`, { resultId: idStr, value, isShots });
    
    setManualInputs((prev: any) => {
      const newInputs = { ...prev, [idStr]: value };
      console.log(`[INPUT-DEBUG] manualInputs updated:`, newInputs);
      return newInputs;
    });
  };

  const handleManualConfirm = (resultId: string, marketLabel: string, isShots: boolean) => {
    const idStr = String(resultId).split('_')[0]; // Extrair ID numérico de id_shots ou id_corners
    const inputValue = manualInputs[resultId];
    if (!inputValue) {
      alert('Por favor, insira um valor antes de confirmar.');
      return;
    }
    
    const manualValue = parseInt(inputValue);
    if (isNaN(manualValue) || manualValue < 0) {
      alert('Por favor, insira um valor válido.');
      return;
    }
    
    const manualInput = isShots 
    ? { shots: manualValue } 
    : { corners: manualValue };
    
    // Usar função de validação importada
    const newResult = validateWithManualInput(marketLabel, manualInput);
    
    // Atualizar resultados
    setResults((prevResults: any[]) => 
      prevResults.map((result: any) => {
        if (String(result.id) === String(resultId)) {
          const updatedResult = { ...result };
          updatedResult.manualInput = { ...result.manualInput, ...manualInput };
          
          // Atualizar main market se for o caso
          if (result.mainMarket.label === marketLabel) {
            updatedResult.mainMarket = {
              ...result.mainMarket,
              result: newResult as any,
              isManual: true,
              profit: newResult === 'win' ? 
                ((result.mainMarket.profit || 0) + (result.mainMarket.stake || 1)) : 
                -(result.mainMarket.stake || 1),
            };
          }
          
          // Atualizar combo se for o caso
          updatedResult.combo = result.combo.map((c: any) => {
            if (c.label === marketLabel) {
              return {
                ...c,
                result: newResult as any,
                isManual: true,
                profit: newResult === 'win' ? 
                  ((c.profit || 0) + (c.stake || 1)) : 
                  -(c.stake || 1),
              };
            }
            return c;
          });
          
          return updatedResult;
        }
        return result;
      })
    );
    
    // Limpar input após confirmação
    setManualInputs((prev: any) => {
      const newInputs = { ...prev };
      delete newInputs[resultId];
      return newInputs;
    });
    
    console.log(`[MANUAL-CONFIRMED] ${resultId}: ${marketLabel} → ${manualValue} = ${newResult}`);
  };

  // Cálculos derivados
  const mktStats = buildMarketStats(results);
  const totalG = results.reduce((s, r) => s + [r.mainMarket, ...r.combo].filter(b => b.result === "win").length, 0);
  const totalAvg = results.reduce((s, r) => s + [r.mainMarket, ...r.combo].filter(b => b.result === "avg").length, 0);
  const totalR = results.reduce((s, r) => s + [r.mainMarket, ...r.combo].filter(b => b.result === "lose").length, 0);
  const totalV = results.reduce((s, r) => s + [r.mainMarket, ...r.combo].filter(b => b.result === "no-odd" || b.result === "push").length, 0);
  const hitRate = totalG + totalR > 0 ? (totalG / (totalG + totalR)) * 100 : 0;
  const hitRateInclAvg = (totalG + totalAvg + totalR) > 0 ? ((totalG + totalAvg) / (totalG + totalAvg + totalR)) * 100 : 0;

  const filtered = results.filter(r => {
    const hasPendingManual = r.mainMarket.result === "pending_manual" || r.combo.some((b: any) => b.result === "pending_manual");
    return filter === "all" ? true : [r.mainMarket, ...r.combo].some((b: any) => b.result === filter);
  });

  return {
    // Estados
    file,
    loading,
    results,
    summary,
    history,
    err,
    showTable,
    filter,
    enriching,
    reqUsed,
    enrichErr,
    manualInputs,
    isGlobalSyncing,
    
    // Setters
    setFile,
    setFilter,
    
    // Funções
    handleImport,
    handleClear,
    handleEnrich,
    handleManualInput,
    handleManualConfirm,
    syncMissingResults,
    fetchTodayGames,
    
    // Cálculos derivados
    mktStats,
    totalG,
    totalAvg,
    totalR,
    totalV,
    hitRate,
    hitRateInclAvg,
    filtered,
    
    // Componentes
    Badge,
    KPI,
    TH,
    TD,
    mktCat,
  };
};
