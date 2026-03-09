import { useState, useEffect, useMemo, useCallback } from "react";
import { runBacktest, processNSGames, enrichWithRealStats, validateWithManualInput, resolveMarketResult, type BetResult } from "../lib/backtest";
import { loadStoredBacktest, saveStoredBacktest, type StoredBacktest } from "../lib/storage";
import { fetchFixtureStatistics } from "../lib/footballApi";
import { parseCSV, extractDateFromHour } from "../engine";
import { supabase, supabaseConfigured, saveCsvDiario } from "../lib/supabase";
import { generateDeterministicId } from "../lib/utils";
import { Badge, KPI, TH, TD, mktCat, C } from "../components/ui";

// 🆕 CONSTANTE GLOBAL - STAKE FIXA R$ 25,00
export const STAKE_FIXA = 25.00;

// Retenção máxima de dados (dias)
const RETENTION_DAYS = 30;

// Extrai data ISO ("2026-02-25") do campo hour do CSV
function getImportDateISO(hour: string): string {
  const h = (hour || '').trim();
  // DD/MM/YYYY
  const ddmmyyyy = h.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // DD-MM-YYYY (com ou sem hora)
  const ddmmyyyyDash = h.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (ddmmyyyyDash) return `${ddmmyyyyDash[3]}-${ddmmyyyyDash[2]}-${ddmmyyyyDash[1]}`;
  // DD/MM (sem ano → usar ano atual)
  const ddmm = h.match(/^(\d{2})\/(\d{2})/);
  if (ddmm) return `${new Date().getFullYear()}-${ddmm[2]}-${ddmm[1]}`;
  // ISO: YYYY-MM-DD
  const iso = h.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // Sem data → data atual
  return new Date().toISOString().split('T')[0];
}

// 🆕 Extrai data DDMM ("0803") do CSV para persistência
function getImportDateDDMM(csvText: string): string {
  const lines = csvText.split('\n');
  // 🆕 Pular primeira linha (cabeçalho) e ir para a primeira linha de dados
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && !line.toLowerCase().includes('match')) {
      const fields = line.split(';');
      console.log(`[CSV-DEBUG] Linha ${i}: ${line.substring(0, 100)}...`);
      console.log(`[CSV-DEBUG] Fields[${fields.length}]:`, fields.slice(0, 8));
      if (fields.length >= 4) {
        const hourField = fields[3]?.trim(); // 🆕 CORREÇÃO: campo hour é índice 3
        console.log(`[CSV-DEBUG] Hour field: "${hourField}"`);
        if (hourField && hourField !== '"Hour"') { // 🆕 Não pegar o nome do campo
          const iso = getImportDateISO(hourField);
          const date = new Date(iso);
          const ddmm = `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          console.log(`[CSV-DEBUG] Extraído: hour="${hourField}" → iso="${iso}" → ddmm="${ddmm}"`);
          return ddmm;
        }
      }
    }
  }
  // Fallback: data atual
  const now = new Date();
  const fallback = `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  console.log(`[CSV-DEBUG] Fallback para data atual: ${fallback}`);
  return fallback;
}

// Remove resultados mais antigos que RETENTION_DAYS
function applyRetention(results: BetResult[]): BetResult[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffISO = cutoff.toISOString().split('T')[0];
  return results.filter(r => {
    const d = (r as any).importDate || getImportDateISO(r.hour);
    return d >= cutoffISO;
  });
}

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
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydration: localStorage (instantâneo) → Supabase (fallback remoto)
  useEffect(() => {
    async function hydrate() {
      if (typeof window === 'undefined') return;
      setLoading(true);
      try {
        // ── PRIORIDADE 1: Cache local acumulado (salvo pelo import com merge) ──
        const cached = localStorage.getItem('lucrativo-processed-games');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Aplicar retenção de 30 dias ao carregar
              const retained = applyRetention(parsed);
              // Recalcular resultados de jogos FT com result pendente
              const resolved = retained.map((r: any) => {
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
              console.log(`[HYDRATION] Cache local: ${resolved.length} jogos (${parsed.length - retained.length} removidos por retenção ${RETENTION_DAYS}d)`);
              setResults(resolved);
              setShowTable(true);
              // Atualizar cache com dados limpos (sem expirados)
              if (retained.length < parsed.length) {
                localStorage.setItem('lucrativo-processed-games', JSON.stringify(resolved));
              }
              const savedCsv = localStorage.getItem('lucrativo-last-csv');
              if (savedCsv) setLastCsvText(savedCsv);
              return;
            }
          } catch { /* cache corrompido, continuar */ }
        }

        // ── PRIORIDADE 2: Supabase (fallback remoto) ──
        if (!supabaseConfigured) {
          console.log('[HYDRATION] Supabase não configurado — modo offline');
          setLoading(false);
          return;
        }
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
            // ID determinístico para consistência local (não usado no upsert)
            id: generateDeterministicId(row.match, row.hour),
            match: row.match, league: row.league ?? '', hour: row.hour ?? '',
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
        // Salvar no cache local com timestamp
        localStorage.setItem('lucrativo-processed-games', JSON.stringify(mapped));
        localStorage.setItem('lucrativo-cache-timestamp', new Date().toISOString().split('T')[0]);
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

    // PROPOSTO — "avg" e "no-odd" viram uma categoria explícita "não resolvido"
    // Filtrar apenas mainMarket com resultado definitivo (win/lose)
    const confirmed = results.filter(r => r.mainMarket.result === "win" || r.mainMarket.result === "lose");
    const unresolved = results.filter(r => r.mainMarket.result === "avg" || r.mainMarket.result === "no-odd");
    const wins = confirmed.filter(r => r.mainMarket.result === "win").length;
    const losses = confirmed.length - wins;
    const totalProfit = confirmed.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0);
    const roi = confirmed.length > 0 ? (totalProfit / (confirmed.length * STAKE_FIXA) * 100) : 0;
    const hitRate = confirmed.length > 0 ? (wins / confirmed.length * 100) : 0;

    const newSummary = {
      totalGames: results.length,
      totalBets: confirmed.length,
      unresolvedBets: unresolved.length,
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

    console.log(`[ROI-RECALC] Unificado: ${confirmed.length} confirmadas, ${unresolved.length} não resolvidas, ROI=${roi.toFixed(2)}%, HitRate=${hitRate.toFixed(2)}%, Profit=R$${totalProfit.toFixed(2)}`);
  }, [results]);

  // Persistir inputs manuais no localStorage
  useEffect(() => {
    if (Object.keys(manualInputs).length > 0) {
      localStorage.setItem('backtest-manual-inputs', JSON.stringify(manualInputs));
      console.log('[MANUAL-INPUTS-SAVED] Inputs manuais salvos no localStorage:', manualInputs);
    }
  }, [manualInputs]);

  // Funções
  const handleImport = async (fileOverride?: File): Promise<number> => {
    const f = fileOverride ?? file;
    if (!f) return 0;
    setLoading(true);
    setErr("");
    try {
      const text = await f.text();
      setLastCsvText(text); // Preservar CSV original para Múltiplas
      if (typeof window !== 'undefined') localStorage.setItem('lucrativo-last-csv', text);
      
      // 🆕 Salvar CSV bruto por data no Supabase
      const csvDataDDMM = getImportDateDDMM(text);
      console.log(`[CSV-IMPORT] Salvando CSV bruto para data ${csvDataDDMM}`);
      const csvSaved = await saveCsvDiario(csvDataDDMM, text);
      if (csvSaved) {
        console.log(`[CSV-IMPORT] CSV bruto salvo com sucesso para ${csvDataDDMM}`);
      } else {
        console.warn(`[CSV-IMPORT] Falha ao salvar CSV bruto para ${csvDataDDMM}`);
      }
      // Usar processNSGames para processar TODOS os jogos (NS + FT)
      const allResults = processNSGames(text);
      // Adicionar stake fixa + importDate
      const newResults: BetResult[] = allResults.map(r => ({
        ...r,
        importDate: getImportDateISO(r.hour),
        mainMarket: { ...r.mainMarket, stake: STAKE_FIXA },
        combo: r.combo.map(c => ({ ...c, stake: STAKE_FIXA })),
      })) as any;

      // 🔄 MERGE com resultados existentes (acumular histórico)
      const prevResults = results; // estado anterior
      const mergedMap = new Map<string, BetResult>();
      // 1. Inserir resultados anteriores
      for (const r of prevResults) mergedMap.set(r.id, r);
      // 2. Sobrescrever com novos (mesmo jogo = atualiza, novo jogo = adiciona)
      for (const r of newResults) mergedMap.set(r.id, r);
      // 3. Aplicar retenção de 30 dias
      const merged = applyRetention(Array.from(mergedMap.values()));

      setResults(merged);
      setShowTable(true);
      const importedCount = newResults.length;
      const totalCount = merged.length;
      console.log(`[CSV-IMPORT] ${importedCount} jogos novos importados, ${totalCount} total acumulado (merge + retenção ${RETENTION_DAYS}d)`);

      // Usar merged em vez de results para Supabase upsert
      const mergedResults = merged;

      // Salvar no Supabase com dados completos (incluindo favorito e combo)
      setSaveError(null); // Limpar erro anterior
      if (supabaseConfigured) {
        try {
          // Verificar conexão antes
          if (!supabaseConfigured) {
            console.warn('[SAVE] Supabase não configurado - dados salvos apenas localmente');
            setSaveError('Dados salvos localmente. Sincronização pendente - configure Supabase.');
            return importedCount;
          }
          
          const { error: pingErr } = await supabase
            .from('bet_results')
            .select('id')
            .limit(1);
            
          if (pingErr) {
            console.error('[SAVE] Supabase inacessível:', pingErr.message);
            throw pingErr;
          }

          // Função para mapear resultado para formato do Supabase
          const toSupabaseRow = (r: BetResult) => ({
            // Sem ID - vai ser gerado pelo Supabase ou usar match+hour como chave
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
            favorito_data: JSON.stringify(r.favorito),
            combo_data: JSON.stringify(r.combo),
            poison_data: JSON.stringify(r.poison),
          });

          const upsertRows = mergedResults.map(toSupabaseRow);

          // Antes do chunking em lotes de 50
          // Deduplicar por match+hour: FT > NS > outros, mais recente por último
          const deduped = Object.values(
            upsertRows.reduce((acc, row) => {
              const key = `${row.match}__${row.hour}` 
              const existing = acc[key]
              if (!existing) return { ...acc, [key]: row }
              
              // Prioridade: FT > qualquer outro status
              const existingIsFT = existing.status === 'FT'
              const rowIsFT = row.status === 'FT'
              
              if (!existingIsFT && rowIsFT) return { ...acc, [key]: row } // novo é FT, substituir
              return acc // manter existente
            }, {} as Record<string, typeof upsertRows[0]>)
          );

          console.log(`[SAVE] Deduplicação: ${upsertRows.length} → ${deduped.length} registros`);

          // Salvar em lotes de 50 para evitar timeout
          const BATCH = 50;
          let totalSaved = 0;
          
          for (let i = 0; i < deduped.length; i += BATCH) {
            const batch = deduped.slice(i, i + BATCH);
            const { data, error: upsertErr } = await supabase
              .from('bet_results')
              .upsert(batch, { 
                onConflict: 'match,hour',  // Usar match+hour como chave de conflito
                ignoreDuplicates: false      // atualiza se já existe
              })
              .select('id');
              
            if (upsertErr) {
              console.error(`[SAVE] Erro no lote ${i}-${i+BATCH}:`, 
                upsertErr.message, upsertErr.details);
              setSaveError(`Erro ao salvar lote ${i}-${i+BATCH}: ${upsertErr.message}`);
            } else {
              totalSaved += data?.length ?? batch.length;
              console.log(`[SAVE] Lote ${i}-${i+BATCH}: OK (${data?.length ?? batch.length} registros)`);
            }
          }
          
          if (totalSaved === deduped.length) {
            console.log(`[SAVE] ✅ Total salvo: ${totalSaved}/${deduped.length}`);
          } else {
            setSaveError(`Salvo parcialmente: ${totalSaved}/${deduped.length}. Verifique conexão.`);
          }
          
        } catch (e: any) {
          console.error('[SAVE] Falha crítica:', e?.message ?? e);
          setSaveError('Dados salvos localmente. Sincronização pendente - verifique conexão.');
        }
      }

      // Salvar no cache local como backup (sem versão fixa — merge garante consistência)
      if (typeof window !== 'undefined') {
        localStorage.setItem('lucrativo-processed-games', JSON.stringify(merged));
        localStorage.setItem('lucrativo-cache-timestamp', new Date().toISOString().split('T')[0]);
      }
      return importedCount;
    } catch (e: any) {
      setErr(e.message || "Erro na importação");
      return 0;
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
      // Chamar API route para obter stats — apenas jogos FT que precisam de dados
      const ftGames = results.filter(r => r.status === 'FT');
      const matches = ftGames.map(r => ({
        homeTeam: r.match.split(" x ")[0]?.trim() || "",
        awayTeam: r.match.split(" x ")[1]?.trim() || "",
        date: (r as any).importDate || new Date().toISOString().split('T')[0],
        afH: 0,
        afA: 0,
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
  const importFromCSV = async (csvFile: File): Promise<number> => {
    setFile(csvFile);
    return await handleImport(csvFile);
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

  // 🆕 Jogos do dia (para Panorama) — usa importDate como fonte de verdade
  const todayGames = useMemo(() => {
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0]; // "2026-02-25"
    const todayDDMM = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`; // "25/02"
    return results.filter(r => {
      // Prioridade 1: importDate (adicionado no merge)
      const importDate = (r as any).importDate;
      if (importDate) return importDate === todayISO;
      // Prioridade 2: parse do campo hour
      const h = (r.hour ?? '').trim();
      if (h.startsWith(todayISO)) return true;
      if (h.startsWith(todayDDMM)) return true;
      // SEM fallback perigoso — jogos sem data identificável não são "hoje"
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

      // Identificar jogos que precisam de dados HT (apenas os que têm fixtureId real da API)
      const missingHTResults = stored.results.filter((r: any) => {
        const fId = r.fixtureId;
        if (!fId || typeof fId !== 'number' || fId <= 0) return false;
        
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
        const fixtureId = result.fixtureId;
        
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
        const syncData = validResults.find((r: any) => r?.fixtureId === result.fixtureId);
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

  // 🆕 Métricas para backtest page
  const confirmed = useMemo(() =>
    results.filter(r => r.mainMarket.result === 'win' || r.mainMarket.result === 'lose'),
    [results]
  );
  
  const wins = useMemo(() =>
    confirmed.filter(r => r.mainMarket.result === 'win').length,
    [confirmed]
  );
  
  const totalProfit = useMemo(() =>
    confirmed.reduce((a, r) => a + Number(r.mainMarket.profit || 0), 0),
    [confirmed]
  );
  
  const roi = useMemo(() =>
    confirmed.length > 0 ? (totalProfit / (confirmed.length * STAKE_FIXA)) * 100 : 0,
    [confirmed, totalProfit]
  );
  
  const hitRateMain = useMemo(() =>
    confirmed.length > 0 ? (wins / confirmed.length * 100) : 0,
    [confirmed, wins]
  );
  
  const leagues = useMemo(() =>
    Array.from(new Set(results.map(r => r.league).filter(Boolean))).sort(),
    [results]
  );

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
    saveError,
    
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
    
    // 🆕 Métricas para backtest page
    confirmed,
    wins,
    totalProfit,
    roi,
    hitRateMain,
    leagues,
    
    // Componentes
    Badge,
    KPI,
    TH,
    TD,
    mktCat,
  };
};
