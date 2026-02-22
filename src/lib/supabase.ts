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
