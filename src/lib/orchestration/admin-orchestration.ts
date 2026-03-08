// ─────────────────────────────────────────
//   ADMIN ORCHESTRATION
//   Funções de orquestração extraídas do admin page
//─────────────────────────────────────────

import { supabase } from '../supabase';

/**
 * Busca odds reais da API Football para os jogos importados
 */
export const handleFetchRealOdds = async (
  results: any[],
  setOdds: React.Dispatch<React.SetStateAction<any>>,
  setOddsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setOddsError: React.Dispatch<React.SetStateAction<string>>
): Promise<void> => {
  if (results.length === 0) {
    alert("❌ Nenhum jogo encontrado. Importe o CSV primeiro!");
    return;
  }
  
  setOddsLoading(true);
  try {
    // Converter resultados para formato CSV
    const csvText = results.map(r => 
      `${r.hour},${r.match},${r.league},${r.mainMarket.label},${r.mainMarket.odd},${r.mainMarket.result || ''}`
    ).join('\n');
    
    // API key é lida server-side pelo route handler
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch('/api/football-odds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText, date: today }),
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    
    const result = await res.json();
    setOdds(result.oddsMap ?? {});
    
    const oddsCount = Object.keys(result.oddsMap ?? {}).length;
    const unmatchedCount = (result.unmatched ?? []).length;
    
    alert(`✅ Odds reais buscadas com sucesso!\n📊 ${oddsCount} jogos com odds reais\n⚠️ ${unmatchedCount} jogos não encontrados na API\n\nVerifique o console para logs detalhados.`);
    
  } catch (e: any) {
    setOddsError("❌ Erro ao buscar odds: " + (e?.message ?? String(e)));
  } finally {
    setOddsLoading(false);
  }
};

/**
 * Limpa base de dados mantendo apenas os últimos 3 dias com backup
 */
export const handleClearDatabase = async (
  setDatabaseInfo: React.Dispatch<React.SetStateAction<any>>,
  setDatabaseError: React.Dispatch<React.SetStateAction<string>>,
  setSuccessMessage: React.Dispatch<React.SetStateAction<string>>
): Promise<void> => {
  if (!confirm("⚠️ ATENÇÃO: Isso limpará a base mantendo apenas os últimos 3 dias. Continuar?")) {
    return;
  }
  
  try {
    console.log("[ADMIN] Iniciando limpeza da base de dados...");
    const result = await cleanupDatabase();
    setDatabaseInfo(result);
    setSuccessMessage("✅ Base de dados limpa com sucesso! Mantidos apenas os últimos 3 dias.");
  } catch (error) {
    console.error("[ADMIN] Erro ao limpar banco:", error);
    setDatabaseError("❌ Erro ao limpar banco. Verifique o console.");
  }
};

/**
 * Processamento completo: importar CSV + enriquecer com odds
 */
export const handleProcessar = async (
  file: File,
  setDatabaseInfo: React.Dispatch<React.SetStateAction<any>>,
  setDatabaseError: React.Dispatch<React.SetStateAction<string>>,
  setSuccessMessage: React.Dispatch<React.SetStateAction<string>>,
  setProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  importFromCSV: (file: File) => Promise<number>,
  enrichWithOdds: (apiKey: string) => Promise<number>
): Promise<void> => {
  if (!file) return;
  setProcessing(true);
  try {
    // a) Parse + save via hook (retorna count de jogos importados)
    const saved = await importFromCSV(file);
    // b) Buscar odds (já existente)
    const apiKey = localStorage.getItem('football-api-key') ?? '';
    let withOdds = 0;
    if (apiKey) {
      withOdds = await enrichWithOdds(apiKey);
    }
    setDatabaseInfo({ saved, withOdds });
    setSuccessMessage(`✅ Processado com sucesso! ${saved} jogos importados, ${withOdds} com odds reais.`);
  } catch (error) {
    console.error("[ADMIN] Erro ao processar:", error);
    setDatabaseError("❌ Erro ao processar. Verifique o console.");
  } finally {
    setProcessing(false);
  }
};

/**
 * Função de backup e limpeza do Supabase
 */
const cleanupDatabase = async () => {
  // 1. Backup dos dados atuais
  console.log("[CLEANUP] Fazendo backup dos dados...");
  const { data: allData, error: fetchError } = await supabase
    .from('bet_results')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (fetchError) throw fetchError;
  
  // Salvar backup localmente
  const backupData = {
    timestamp: new Date().toISOString(),
    totalRecords: allData?.length || 0,
    records: allData
  };
  
  const blob = new Blob([JSON.stringify(backupData, null, 2)], 
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bet_results_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`[CLEANUP] Backup salvo: ${backupData.totalRecords} registros`);
  
  // 2. Calcular data limite (3 dias atrás)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffDate = threeDaysAgo.toISOString();
  
  // 3. Contar registros que serão removidos
  const { count: oldCount, error: countError } = await supabase
    .from('bet_results')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', cutoffDate);
  
  if (countError) throw countError;
  
  console.log(`[CLEANUP] Serão removidos ${oldCount} registros anteriores a ${cutoffDate}`);
  
  // 4. Remover registros antigos
  if (oldCount && oldCount > 0) {
    const { error: deleteError } = await supabase
      .from('bet_results')
      .delete()
      .lt('created_at', cutoffDate);
    
    if (deleteError) throw deleteError;
    
    console.log(`[CLEANUP] ✅ Removidos ${oldCount} registros antigos`);
  }
  
  // 5. Verificar registros restantes
  const { count: remainingCount, error: remainingError } = await supabase
    .from('bet_results')
    .select('*', { count: 'exact', head: true });
  
  if (remainingError) throw remainingError;
  
  console.log(`[CLEANUP] ✅ Restam ${remainingCount} registros (últimos 3 dias)`);
  
  return {
    removed: oldCount,
    remaining: remainingCount,
    backupSaved: true
  };
};
