import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Log para diagnóstico — aparece no console do browser
if (typeof window !== 'undefined') {
  console.log('[SUPABASE] URL presente:', !!supabaseUrl);
  console.log('[SUPABASE] KEY presente:', !!supabaseAnonKey);
  console.log('[SUPABASE] URL value:', supabaseUrl.slice(0, 30));
}

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.warn('[Supabase] Variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — modo offline');
}

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder');

// 🆕 Wrapper para evitar chamadas de rede em modo offline
export const safeSupabaseCall = async <T>(
  operation: () => Promise<T>,
  fallbackValue: T
): Promise<T> => {
  if (!supabaseConfigured) {
    console.warn('[SUPABASE] Operação ignorada - modo offline');
    return fallbackValue;
  }
  
  try {
    return await operation();
  } catch (error) {
    console.error('[SUPABASE] Erro na operação:', error);
    return fallbackValue;
  }
};

export interface BacktestRecord {
  id: string;
  user_id?: string;
  version: string;
  created_at: string;
  updated_at: string;
  data: {
    results: any[];
    summary: any;
  };
}

export interface CsvDiarioRecord {
  data: string;
  csv_text: string;
  created_at: string;
  updated_at: string;
}

// 🆕 Funções para persistência de CSV bruto por data
export async function saveCsvDiario(data: string, csvText: string): Promise<boolean> {
  if (!supabaseConfigured) {
    console.warn('[CSV-DIARIO] Supabase não configurado - salvando apenas no localStorage');
    localStorage.setItem(`csv-diario-${data}`, csvText);
    return true;
  }

  return safeSupabaseCall(async () => {
    const { error } = await supabase
      .from('csv_diario')
      .upsert({
        data: data,
        csv_text: csvText,
        updated_at: new Date().toISOString()
      }, { onConflict: 'data' });

    if (error) {
      console.error('[CSV-DIARIO] Erro ao salvar CSV:', error);
      return false;
    }

    console.log(`[CSV-DIARIO] CSV salvo para data ${data} (${csvText.length} chars)`);
    return true;
  }, false);
}

// 🆕 Função para salvar CSV manualmente com data específica (para testes)
export async function saveCsvDiarioManual(data: string, csvText: string): Promise<boolean> {
  console.log(`[CSV-DIARIO-MANUAL] Salvando CSV manual para data ${data}`);
  return saveCsvDiario(data, csvText);
}

export async function loadCsvDiario(data: string): Promise<string | null> {
  if (!supabaseConfigured) {
    console.log('[CSV-DIARIO] Supabase não configurado - carregando do localStorage');
    return localStorage.getItem(`csv-diario-${data}`) || null;
  }

  return safeSupabaseCall(async () => {
    const { data: result, error } = await supabase
      .from('csv_diario')
      .select('csv_text')
      .eq('data', data)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log(`[CSV-DIARIO] Nenhum CSV encontrado para data ${data}`);
      } else {
        console.error('[CSV-DIARIO] Erro ao carregar CSV:', error);
      }
      return null;
    }

    console.log(`[CSV-DIARIO] CSV carregado para data ${data} (${result.csv_text.length} chars)`);
    return result.csv_text;
  }, null);
}
