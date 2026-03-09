// ─────────────────────────────────────────
//   BASE STATUS VALIDATION
//   Validação operacional da comunicação com a base
//─────────────────────────────────────────

import { supabase, supabaseConfigured, safeSupabaseCall } from './supabase';

// Interface para status da base
export interface BaseStatus {
  csvBrutoSalvo: boolean;
  betresultsSalvo: boolean;
  hidratacaoLocalOk: boolean;
  fallbackSupabaseOk: boolean;
  totalRegistrosImportados: number;
  erros: string[];
  ultimoSave: {
    sucesso: boolean;
    mensagem: string;
    timestamp: string;
  };
  checks: {
    csvStorage: 'ok' | 'erro' | 'vazio' | 'nao_salvo';
    betresultsTable: 'ok' | 'erro' | 'vazio' | 'nao_salvo';
    localStorage: 'ok' | 'erro' | 'vazio' | 'nao_salvo';
    supabaseConnection: 'ok' | 'erro' | 'offline' | 'nao_salvo';
  };
  cicloCompleto: {
    csvBruto: boolean;
    betresults: boolean;
    cacheLocal: boolean;
    reidratacaoOk: boolean;
    status: 'completo' | 'incompleto' | 'erro';
  };
}

/**
 * Validar status completo da comunicação com a base
 */
export async function validateBaseStatus(results: any[] = []): Promise<BaseStatus> {
  const status: BaseStatus = {
    csvBrutoSalvo: false,
    betresultsSalvo: false,
    hidratacaoLocalOk: false,
    fallbackSupabaseOk: false,
    totalRegistrosImportados: results.length,
    erros: [],
    ultimoSave: {
      sucesso: false,
      mensagem: '',
      timestamp: ''
    },
    checks: {
      csvStorage: 'nao_salvo',
      betresultsTable: 'nao_salvo',
      localStorage: 'nao_salvo',
      supabaseConnection: 'nao_salvo'
    },
    cicloCompleto: {
      csvBruto: false,
      betresults: false,
      cacheLocal: false,
      reidratacaoOk: false,
      status: 'incompleto'
    }
  };

  try {
    // 1. Verificar CSV bruto salvo no localStorage
    const csvKeys = Object.keys(localStorage).filter(key => key.startsWith('csv_bruto_'));
    status.csvBrutoSalvo = csvKeys.length > 0;
    status.checks.csvStorage = csvKeys.length > 0 ? 'ok' : 'nao_salvo';

    // 2. Verificar betresults no localStorage
    const localResults = localStorage.getItem('bet_results');
    status.hidratacaoLocalOk = !!localResults;
    status.checks.localStorage = localResults ? 'ok' : 'vazio';

    // 3. Verificar conexão com Supabase
    if (!supabaseConfigured) {
      status.erros.push('Supabase não configurado - modo offline');
      status.checks.supabaseConnection = 'offline';
      status.totalRegistrosImportados = 0;
    } else {
      try {
        const { count, error } = await supabase
          .from('bet_results')
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          status.erros.push(`Erro Supabase: ${error.message}`);
          status.checks.supabaseConnection = 'erro';
        } else {
          status.checks.supabaseConnection = count && count > 0 ? 'ok' : 'nao_salvo';
          status.totalRegistrosImportados = count || 0;
        }
      } catch (e) {
        status.erros.push('Falha na conexão com Supabase');
        status.checks.supabaseConnection = 'erro';
      }
    }

    // 4. Verificar último save (se existe no localStorage)
    const lastSave = localStorage.getItem('ultimo_save_status');
    if (lastSave) {
      try {
        const saveData = JSON.parse(lastSave);
        status.ultimoSave = {
          sucesso: saveData.success || false,
          mensagem: saveData.message || '',
          timestamp: saveData.timestamp || ''
        };
      } catch (e) {
        status.ultimoSave.mensagem = 'Erro ao ler status do último save';
      }
    }

    // 🆕 5. Validar ciclo completo
    status.cicloCompleto.csvBruto = status.csvBrutoSalvo;
    status.cicloCompleto.betresults = status.betresultsSalvo;
    status.cicloCompleto.cacheLocal = status.hidratacaoLocalOk;
    
    // Simular reidratação
    const reidratacao = simulateRefreshAndHydration();
    status.cicloCompleto.reidratacaoOk = reidratacao.hidratacaoOk;
    
    // Determinar status do ciclo
    const checksCompletos = [
      status.cicloCompleto.csvBruto,
      status.cicloCompleto.betresults,
      status.cicloCompleto.cacheLocal,
      status.cicloCompleto.reidratacaoOk
    ];
    
    const todosOk = checksCompletos.every(check => check);
    const algumOk = checksCompletos.some(check => check);
    
    if (todosOk) {
      status.cicloCompleto.status = 'completo';
    } else if (algumOk) {
      status.cicloCompleto.status = 'incompleto';
    } else {
      status.cicloCompleto.status = 'erro';
    }

  } catch (error) {
    console.error('[BASE STATUS] Erro na validação:', error);
    status.ultimoSave.mensagem = `Erro na validação: ${error}`;
  }

  return status;
}

/**
 * Salvar status do save no localStorage
 */
export function saveLastSaveStatus(success: boolean, message: string): void {
  const status = {
    success,
    message,
    timestamp: new Date().toISOString()
  };
  
  localStorage.setItem('ultimo_save_status', JSON.stringify(status));
  
  // Manter apenas os últimos 10 saves
  const savesJson = localStorage.getItem('save_history');
  const saves = savesJson ? JSON.parse(savesJson) : [];
  saves.push(status);
  
  if (saves.length > 10) {
    saves.splice(0, saves.length - 10);
  }
  
  localStorage.setItem('save_history', JSON.stringify(saves));
}

/**
 * Validar ciclo completo de importação
 */
export async function validateImportCycle(file: File): Promise<{
  importacao: boolean;
  persistencia: boolean;
  hidratacao: boolean;
  consistencia: boolean;
  erros: string[];
}> {
  const result = {
    importacao: false,
    persistencia: false,
    hidratacao: false,
    consistencia: false,
    erros: [] as string[]
  };

  try {
    // 1. Validar importação (se o arquivo pode ser lido)
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    result.importacao = lines.length > 1; // header + pelo menos 1 linha
    
    if (!result.importacao) {
      result.erros.push('Arquivo CSV inválido ou vazio');
      return result;
    }

    // 2. Validar persistência (se os dados foram salvos)
    const localResults = localStorage.getItem('bet_results');
    result.persistencia = !!localResults;
    
    if (!result.persistencia) {
      result.erros.push('Dados não persistidos no localStorage');
    }

    // 3. Validar hidratação (se os dados voltam após refresh simulado)
    if (localResults) {
      try {
        const parsed = JSON.parse(localResults);
        result.hidratacao = Array.isArray(parsed) && parsed.length > 0;
        
        if (!result.hidratacao) {
          result.erros.push('Dados não hidratados corretamente');
        }
      } catch (e) {
        result.erros.push('Erro ao hidratar dados');
        result.hidratacao = false;
      }
    }

    // 4. Validar consistência (se número de linhas = número de registros)
    if (result.importacao && result.hidratacao) {
      const localResults = JSON.parse(localStorage.getItem('bet_results') || '[]');
      result.consistencia = localResults.length === lines.length - 1; // -1 pelo header
      
      if (!result.consistencia) {
        result.erros.push(`Inconsistência: ${lines.length - 1} linhas no CSV vs ${localResults.length} registros salvos`);
      }
    }

  } catch (error) {
    result.erros.push(`Erro na validação do ciclo: ${error}`);
  }

  return result;
}

/**
 * Simular refresh para testar hidratação
 */
export function simulateRefreshAndHydration(): {
  beforeRefresh: any[];
  afterRefresh: any[];
  hidratacaoOk: boolean;
} {
  // Capturar estado antes
  const beforeRefresh = JSON.parse(localStorage.getItem('bet_results') || '[]');
  
  // Simular limpeza do estado (como se fosse refresh)
  const tempBackup = localStorage.getItem('bet_results');
  localStorage.removeItem('bet_results');
  
  // Simular hidratação (como se fosse no useEffect)
  let afterRefresh: any[] = [];
  try {
    // Verificar se há dados no localStorage para hidratar
    const stored = localStorage.getItem('bet_results');
    if (stored) {
      afterRefresh = JSON.parse(stored);
    }
    
    // Restaurar backup para não quebrar o estado real
    if (tempBackup) {
      localStorage.setItem('bet_results', tempBackup);
    }
    
  } catch (error) {
    // Restaurar backup em caso de erro
    if (tempBackup) {
      localStorage.setItem('bet_results', tempBackup);
    }
    afterRefresh = [];
  }
  
  return {
    beforeRefresh,
    afterRefresh,
    hidratacaoOk: beforeRefresh.length === afterRefresh.length
  };
}
