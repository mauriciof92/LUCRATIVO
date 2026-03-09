// ─────────────────────────────────────────
//   SYNC LOCAL TO SUPABASE
//   Força sincronização do localStorage para Supabase
//─────────────────────────────────────────

import { supabase } from './supabase';

/**
 * Força upsert completo do localStorage para Supabase
 */
export async function syncLocalToSupabase(): Promise<{
  success: boolean;
  localCount: number;
  remoteCount: number;
  syncedCount: number;
  errors: string[];
}> {
  const result = {
    success: false,
    localCount: 0,
    remoteCount: 0,
    syncedCount: 0,
    errors: [] as string[]
  };

  try {
    // 1. Obter dados do localStorage
    const localData = localStorage.getItem('lucrativo-processed-games');
    if (!localData) {
      result.errors.push('Nenhum dado encontrado no localStorage');
      return result;
    }

    const jogos = JSON.parse(localData);
    result.localCount = jogos.length;

    console.log(`[SYNC] Encontrados ${result.localCount} jogos no localStorage`);

    // 2. Verificar conexão com Supabase
    try {
      const { count, error } = await supabase
        .from('bet_results')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        result.errors.push(`Erro Supabase: ${error.message}`);
        return result;
      }
      
      result.remoteCount = count || 0;
      console.log(`[SYNC] Supabase atualmente com ${result.remoteCount} registros`);
    } catch (e) {
      result.errors.push('Falha na conexão com Supabase');
      return result;
    }

    // 3. Preparar dados para upsert
    const toSupabaseRow = (r: any) => ({
      match: r.match,
      league: r.league,
      hour: r.hour,
      status: r.status,
      result_home: r.resultHome,
      result_away: r.resultAway,
      profile: r.profile,
      score: r.score,
      confidence: r.confidence,
      main_market_label: r.mainMarket?.label || '',
      main_market_odd: r.mainMarket?.odd || 0,
      main_market_result: r.mainMarket?.result || '',
      main_market_profit: r.mainMarket?.profit || 0,
      favorito_data: JSON.stringify(r.favorito || {}),
      combo_data: JSON.stringify(r.combo || []),
      poison_data: JSON.stringify(r.poison || {}),
    });

    const upsertRows = jogos.map(toSupabaseRow);

    // 4. Limpar tabela existente (para garantir sincronização completa)
    console.log('[SYNC] Limpando tabela existente...');
    const { error: deleteError } = await supabase
      .from('bet_results')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // deletar todos
    
    if (deleteError) {
      result.errors.push(`Erro ao limpar tabela: ${deleteError.message}`);
      return result;
    }

    // 5. Inserir todos os dados
    console.log(`[SYNC] Inserindo ${upsertRows.length} registros...`);
    const BATCH = 50;
    
    for (let i = 0; i < upsertRows.length; i += BATCH) {
      const batch = upsertRows.slice(i, i + BATCH);
      const { data, error: insertError } = await supabase
        .from('bet_results')
        .insert(batch)
        .select('id');
        
      if (insertError) {
        result.errors.push(`Erro no lote ${i}-${i+BATCH}: ${insertError.message}`);
        console.error(`[SYNC] Erro no lote ${i}-${i+BATCH}:`, insertError);
      } else {
        result.syncedCount += data?.length || batch.length;
        console.log(`[SYNC] Lote ${i}-${i+BATCH}: OK (${data?.length || batch.length} registros)`);
      }
    }

    // 6. Verificação final
    const { count: finalCount, error: finalError } = await supabase
      .from('bet_results')
      .select('*', { count: 'exact', head: true });
    
    if (finalError) {
      result.errors.push(`Erro na verificação final: ${finalError.message}`);
    } else {
      result.remoteCount = finalCount || 0;
      result.success = result.remoteCount === result.localCount;
      
      console.log(`[SYNC] ✅ Sincronização concluída: ${result.localCount} local → ${result.remoteCount} remoto`);
    }

  } catch (error) {
    console.error('[SYNC] Erro geral:', error);
    result.errors.push(`Erro geral: ${error}`);
  }

  return result;
}
