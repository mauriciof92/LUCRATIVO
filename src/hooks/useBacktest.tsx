import { useState, useEffect, useMemo } from "react";
import { runBacktest, processNSGames, enrichWithRealStats, validateWithManualInput, resolveMarketResult, type BetResult } from "../lib/backtest";
import { loadStoredBacktest, saveStoredBacktest, type StoredBacktest } from "../lib/storage";
import { fetchRealStatsForMatches, fetchFixtureStatistics } from "../lib/footballApi";
import { parseCSV } from "../engine";
import { supabase } from "../lib/supabase";
import { Badge, KPI, TH, TD, mktCat, C } from "../components/ui";

// 🆕 CONSTANTE GLOBAL - STAKE FIXA R$ 25,00
export const STAKE_FIXA = 25.00;

// Re-export UI components for backward compatibility
export { Badge, KPI, TH, TD, mktCat } from "../components/ui";

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

  // 🆕 CSV text original preservado para Múltiplas
  const [lastCsvText, setLastCsvText] = useState<string>("");

  // 🆕 FASE 5.3: Estado global para sincronização
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);

  // Hydration: localStorage (instantâneo) → Supabase (fallback remoto)
  useEffect(() => {
    async function hydrate() {
      if (typeof window === 'undefined') return;
      setLoading(true);
      try {
        // ── PRIORIDADE 1: Cache local completo (salvo pelo import) ──
        const cached = localStorage.getItem('lucrativo-processed-games');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Recalcular resultados de jogos FT com result pendente
              const resolved = parsed.map((r: any) => {
                const isFT = r.status === 'FT';
                const mr = r.mainMarket;
                if (isFT && mr && (mr.result === 'no-odd' || mr.result === 'pending_manual') && mr.label) {
                  const result = resolveMarketResult(mr.label, r);
                  const profit = result === 'win' ? (mr.odd ?? 0) * STAKE_FIXA - STAKE_FIXA
                               : result === 'lose' ? -STAKE_FIXA : 0;
                  return { ...r, mainMarket: { ...mr, result, profit } };
                }
                return r;
              });
              console.log(`[HYDRATION] Cache local: ${resolved.length} jogos`);
              setResults(resolved);
              setShowTable(true);
              const savedCsv = localStorage.getItem('lucrativo-last-csv');
              if (savedCsv) setLastCsvText(savedCsv);
              return;
            }
          } catch { /* cache corrompido, continuar */ }
        }

        // ── PRIORIDADE 2: Supabase (fallback remoto) ──
        console.log('[HYDRATION] Sem cache local, buscando Supabase...');
        const { data: betData, error } = await supabase
          .from('bet_results')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        if (!betData || betData.length === 0) {
          console.log('[HYDRATION] Nenhum dado encontrado');
          return;
        }

        const mapped: BetResult[] = betData.map(row => {
          let favorito: any = { lado: '', nome: '', nomeUnder: '', afFav: 0, afUnder: 0, afDiff: 0, chFavGol: 0, chFavTot: 0, chUnderGol: 0, chUnderTot: 0, cantFavHT: 0, cantUnderHT: 0, cantFavFT: 0, gol05HTFav: 0 };
          try { const f = row.favorito_data ? JSON.parse(row.favorito_data) : null; if (f?.nome) favorito = f; } catch {}

          let combo: any[] = [];
          try { const c = row.combo_data ? JSON.parse(row.combo_data) : null; if (Array.isArray(c)) combo = c; } catch {}

          let poison;
          try { poison = row.poison_data ? JSON.parse(row.poison_data) : undefined; } catch {}

          // Recalcular resultado para jogos FT que ainda estão como 'no-odd'
          const isFT = (row.status ?? '') === 'FT';
          const storedResult = row.main_market_result ?? 'no-odd';
          const label = row.main_market_label ?? '';
          const rHome = row.result_home ?? 0;
          const rAway = row.result_away ?? 0;
          let mainResult = storedResult;
          let mainProfit = Number(row.main_market_profit ?? 0);
          if (isFT && (storedResult === 'no-odd' || storedResult === 'pending_manual') && label) {
            mainResult = resolveMarketResult(label, { resultHome: rHome, resultAway: rAway });
            const odd = Number(row.main_market_odd ?? 0);
            mainProfit = mainResult === 'win' ? odd * STAKE_FIXA - STAKE_FIXA
                       : mainResult === 'lose' ? -STAKE_FIXA : 0;
          }

          // Recalcular combo results também
          const resolvedCombo = combo.map((c: any) => {
            if (isFT && (c.result === 'no-odd' || c.result === 'pending_manual') && c.label) {
              const cResult = resolveMarketResult(c.label, { resultHome: rHome, resultAway: rAway });
              const cOdd = Number(c.odd ?? 0);
              const cProfit = cResult === 'win' ? cOdd * STAKE_FIXA - STAKE_FIXA
                            : cResult === 'lose' ? -STAKE_FIXA : 0;
              return { ...c, result: cResult, profit: cProfit };
            }
            return c;
          });

          return {
            id: row.id, match: row.match, league: row.league ?? '', hour: row.hour ?? '',
            status: row.status ?? '', resultHome: rHome, resultAway: rAway,
            profile: row.profile ?? '', score: Number(row.score ?? 0), confidence: Number(row.confidence ?? 0),
            created_at: row.created_at ?? '', favorito, poison,
            mainMarket: {
              label, odd: Number(row.main_market_odd ?? 0),
              minOdd: 0, stake: STAKE_FIXA, result: mainResult as any,
              profit: mainProfit, hasValue: false,
            },
            combo: resolvedCombo, ftGoals: rHome + rAway,
          };
        });

        console.log(`[HYDRATION] Supabase: ${mapped.length} jogos`);
        setResults(mapped);
        setShowTable(true);
        // Salvar no cache local para próxima vez ser instantâneo
        localStorage.setItem('lucrativo-processed-games', JSON.stringify(mapped));
      } catch (e) {
        console.error('[HYDRATION] Erro:', e);
      } finally {
        setLoading(false);
      }
    }
    hydrate();
  }, []);

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
  const handleImport = async (fileOverride?: File) => {
    const f = fileOverride ?? file;
    if (!f) return;
    setLoading(true);
    setErr("");
    try {
      const text = await f.text();
      setLastCsvText(text); // Preservar CSV original para Múltiplas
      if (typeof window !== 'undefined') localStorage.setItem('lucrativo-last-csv', text);
      // Usar processNSGames para processar TODOS os jogos (NS + FT)
      const allResults = processNSGames(text);
      // Adicionar stake fixa
      const results: BetResult[] = allResults.map(r => ({
        ...r,
        mainMarket: { ...r.mainMarket, stake: STAKE_FIXA },
        combo: r.combo.map(c => ({ ...c, stake: STAKE_FIXA })),
      }));
      setResults(results);
      setShowTable(true);
      console.log(`[CSV-IMPORT] ${results.length} jogos importados (NS+FT) com engine completo`);

      // Salvar no Supabase com dados completos (incluindo favorito e combo)
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
        favorito_data: JSON.stringify(r.favorito ?? {}),
        combo_data: JSON.stringify(r.combo ?? []),
        poison_data: JSON.stringify(r.poison ?? {}),
      }));
      const { error: upsertErr } = await supabase.from('bet_results').upsert(upsertRows, { onConflict: 'id' });
      if (upsertErr) console.warn('[CSV-IMPORT] Supabase upsert warning:', upsertErr.message);
      else console.log(`[CSV-IMPORT] ${upsertRows.length} jogos salvos no Supabase`);

      // Salvar no cache local como backup
      if (typeof window !== 'undefined') {
        localStorage.setItem('lucrativo-processed-games', JSON.stringify(results));
      }
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
    localStorage.removeItem('lucrativo-processed-games');
    localStorage.removeItem('lucrativo-backtest-data');
    localStorage.removeItem('lucrativo-last-csv');
    setLastCsvText('');
    console.log('[CLEAR] Estado limpo (todos os caches)');
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

  // 🆕 Wrapper para importFromCSV (compatibilidade com Admin)
  const importFromCSV = async (csvFile: File) => {
    setFile(csvFile);
    await handleImport(csvFile);
  };

  // 🆕 Wrapper para enrichWithOdds (compatibilidade com Admin)
  const enrichWithOdds = async (apiKey: string) => {
    // Salvar API key se necessário
    if (apiKey) {
      localStorage.setItem('football-api-key', apiKey);
    }
    await handleEnrich();
    return reqUsed; // retorna número de odds enriquecidas
  };

  // 🆕 Jogos do dia (para Panorama)
  const todayGames = useMemo(() => {
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0]; // "2026-02-21"
    const todayDDMM = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`; // "21/02"
    return results.filter(r => {
      const h = (r.hour ?? '').trim();
      // Suporta formatos: "2026-02-21 15:00", "21/02 15:00", "21/02/2026 15:00"
      if (h.startsWith(todayISO)) return true;
      if (h.startsWith(todayDDMM)) return true;
      // Fallback: se não tem data no hour, considerar como hoje (jogos recem importados)
      if (!h.includes('/') && !h.includes('-') && h.includes(':')) return true;
      return false;
    });
  }, [results]);

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
    
    // 🆕 Wrappers para Admin
    importFromCSV,
    enrichWithOdds,
    
    // 🆕 Jogos do dia
    todayGames,
    
    // 🆕 CSV text original para Múltiplas
    lastCsvText,
    
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
