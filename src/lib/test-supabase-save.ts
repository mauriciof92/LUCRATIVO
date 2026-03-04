// Test script para verificar save do Supabase após adicionar colunas
import { supabase, supabaseConfigured } from './supabase';
import { generateDeterministicId } from './utils';

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
    
    // Função para gerar ID determinístico
    const toSupabaseRow = (r: any) => ({
      // Sem ID - vai ser gerado pelo Supabase ou usar match+hour como chave
      match: r.match,
      league: r.league,
      hour: r.hour,
      status: r.status,
      result_home: r.result_home,
      result_away: r.result_away,
      profile: r.profile,
      score: r.score,
      confidence: r.confidence,
      main_market_label: r.main_market_label,
      main_market_odd: r.main_market_odd,
      main_market_result: r.main_market_result,
      main_market_profit: r.main_market_profit,
      favorito_data: JSON.stringify(r.favorito_data),
      combo_data: JSON.stringify(r.combo_data),
      poison_data: JSON.stringify(r.poison_data),
    });

    const testData = [toSupabaseRow({
      match: 'Test Team A vs Test Team B',
      league: 'Test League',
      hour: '03/03/2026 20:00',
      status: 'FT',
      result_home: 2,
      result_away: 1,
      profile: 'test',
      score: 75,
      confidence: 85,
      main_market_label: 'Over 2.5',
      main_market_odd: 1.85,
      main_market_result: 'win',
      main_market_profit: 21.25,
      favorito_data: { test: true },
      combo_data: [{ test: true }],
      poison_data: { test: true },
    })];
    
    const { data, error: upsertErr } = await supabase
      .from('bet_results')
      .upsert(testData, { 
        onConflict: 'match,hour',  // Usar match+hour como chave de conflito
        ignoreDuplicates: false      // atualiza se já existe
      })
      .select('id');
      
    if (upsertErr) {
      console.error('[TEST] Erro no upsert:', upsertErr.message, upsertErr.details);
      return false;
    }
    
    console.log('[TEST] ✅ Upsert OK:', data?.length, 'registros');
    
    // Limpar dados de teste (usar match+hour para identificar)
    await supabase
      .from('bet_results')
      .delete()
      .eq('match', 'Test Team A vs Test Team B')
      .eq('hour', '03/03/2026 20:00');
      
    console.log('[TEST] 🧹 Dados de teste removidos');
    return true;
    
  } catch (e: any) {
    console.error('[TEST] Erro geral:', e?.message ?? e);
    return false;
  }
}
