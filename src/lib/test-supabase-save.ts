// Test script para verificar save do Supabase após adicionar colunas
import { supabase } from './supabase';

export async function testSupabaseSave() {
  console.log('[TEST] Iniciando teste de save no Supabase...');
  
  try {
    // Teste de conexão
    const { error: pingErr } = await supabase
      .from('bet_results')
      .select('id')
      .limit(1);
      
    if (pingErr) {
      console.error('[TEST] Erro de conexão:', pingErr.message);
      return false;
    }
    
    console.log('[TEST] Conexão OK');
    
    // Teste de upsert com dados mock
    const testData = [{
      id: 'test-' + Date.now(),
      match: 'Test Match x Test',
      league: 'Test League',
      hour: new Date().toISOString(),
      status: 'FT',
      result_home: 1,
      result_away: 0,
      profile: 'test',
      score: 85,
      confidence: 0.9,
      main_market_label: 'Test Market',
      main_market_odd: 2.0,
      main_market_result: 'win',
      main_market_profit: 1.0,
      favorito_data: JSON.stringify({ test: true }),
      combo_data: JSON.stringify([{ test: true }]),
      poison_data: JSON.stringify({ test: true }),
    }];
    
    const { data, error: upsertErr } = await supabase
      .from('bet_results')
      .upsert(testData, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select('id');
      
    if (upsertErr) {
      console.error('[TEST] Erro no upsert:', upsertErr.message, upsertErr.details);
      return false;
    }
    
    console.log('[TEST] ✅ Upsert OK:', data?.length, 'registros');
    
    // Limpar dados de teste
    await supabase
      .from('bet_results')
      .delete()
      .eq('id', testData[0].id);
      
    console.log('[TEST] 🧹 Dados de teste removidos');
    return true;
    
  } catch (e: any) {
    console.error('[TEST] Erro geral:', e?.message ?? e);
    return false;
  }
}
