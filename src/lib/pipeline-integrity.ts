// ─────────────────────────────────────────
//   PIPELINE INTEGRITY VALIDATION
//   Validação completa da cadeia de dados
//─────────────────────────────────────────

import { supabase } from './supabase';

// Interface para integridade do pipeline
export interface PipelineIntegrity {
  csvBrutoSalvo: boolean;
  cacheLocalSalvo: boolean;
  betresultsSalvo: boolean;
  reidratacaoOk: boolean;
  divergenciaLocalRemoto: boolean;
  divergenciaEsperada: boolean; // por deduplicação
  erros: string[];
  scoreFinal: number;
  status: 'integro' | 'degradado' | 'critico';
  contagens: {
    csvLinhas: number;
    cacheLocal: number;
    supabaseRemoto: number;
    posHidratacao: number;
    fallback: number;
  };
  detalhes: {
    perdaDados: number;
    retencaoAplicada: boolean;
    recalculoMainMarket: boolean;
    recalculoProfit: boolean;
  };
}

/**
 * Validar integridade completa do pipeline de dados
 */
export async function validatePipelineIntegrity(): Promise<PipelineIntegrity> {
  const integrity: PipelineIntegrity = {
    csvBrutoSalvo: false,
    cacheLocalSalvo: false,
    betresultsSalvo: false,
    reidratacaoOk: false,
    divergenciaLocalRemoto: false,
    divergenciaEsperada: false,
    erros: [],
    scoreFinal: 0,
    status: 'integro',
    contagens: {
      csvLinhas: 0,
      cacheLocal: 0,
      supabaseRemoto: 0,
      posHidratacao: 0,
      fallback: 0
    },
    detalhes: {
      perdaDados: 0,
      retencaoAplicada: false,
      recalculoMainMarket: false,
      recalculoProfit: false
    }
  };

  try {
    // 1. Verificar CSV bruto salvo (usar fonte real do fluxo)
    const csvOriginal = localStorage.getItem('lucrativo-last-csv');
    integrity.csvBrutoSalvo = !!csvOriginal;
    
    if (csvOriginal) {
      // Contar linhas do CSV (menos header)
      const linhas = csvOriginal.split('\n').filter(line => line.trim());
      integrity.contagens.csvLinhas = Math.max(0, linhas.length - 1);
    } else {
      integrity.erros.push('CSV original não encontrado em lucrativo-last-csv');
    }

    // 2. Verificar cache local salvo
    const cacheLocal = localStorage.getItem('lucrativo-processed-games');
    integrity.cacheLocalSalvo = !!cacheLocal;
    
    if (cacheLocal) {
      try {
        const jogos = JSON.parse(cacheLocal);
        integrity.contagens.cacheLocal = jogos.length;
      } catch (e) {
        integrity.erros.push('Cache local corrompido ou inválido');
      }
    } else {
      integrity.erros.push('Cache local não encontrado em lucrativo-processed-games');
    }

    // 3. Verificar betresults salvo no Supabase
    try {
      const { count, error } = await supabase
        .from('bet_results')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        integrity.erros.push(`Erro Supabase: ${error.message}`);
      } else {
        integrity.contagens.supabaseRemoto = count || 0;
        integrity.betresultsSalvo = integrity.contagens.supabaseRemoto > 0;
        
        if (!integrity.betresultsSalvo) {
          integrity.erros.push('Nenhum registro encontrado no Supabase');
        }
      }
    } catch (e) {
      integrity.erros.push('Falha na conexão com Supabase');
    }

    // 4. Verificar reidratação
    const reidratacaoTest = simulateRefreshAndHydration();
    integrity.reidratacaoOk = reidratacaoTest.hidratacaoOk;
    integrity.contagens.posHidratacao = reidratacaoTest.afterRefresh.length;
    
    if (!integrity.reidratacaoOk) {
      integrity.erros.push('Reidratação falhou - dados inconsistentes após refresh');
    }

    // 5. Verificar divergência local vs remoto (com distinção)
    if (integrity.contagens.cacheLocal > 0 && integrity.contagens.supabaseRemoto > 0) {
      const localCount = integrity.contagens.cacheLocal;
      const remoteCount = integrity.contagens.supabaseRemoto;
      
      integrity.divergenciaLocalRemoto = localCount !== remoteCount;
      
      // Verificar se divergência é esperada por deduplicação
      if (integrity.divergenciaLocalRemoto) {
        // Se remoto < local, provavelmente deduplicação por match,hour
        if (remoteCount < localCount) {
          integrity.divergenciaEsperada = true;
          integrity.detalhes.perdaDados = localCount - remoteCount;
          integrity.detalhes.retencaoAplicada = true;
          integrity.erros.push(`Divergência esperada: deduplicação por match,hour (${localCount} → ${remoteCount})`);
        } else {
          // Se remoto > local, suspeita de problema
          integrity.erros.push(`Divergência suspeita: Remoto maior que Local (${localCount} vs ${remoteCount})`);
        }
      }
    }

    // 6. Verificar perda real vs retenção
    if (integrity.contagens.csvLinhas > 0) {
      const perdaPercentual = ((integrity.contagens.csvLinhas - integrity.contagens.cacheLocal) / integrity.contagens.csvLinhas) * 100;
      
      if (perdaPercentual > 10) {
        integrity.detalhes.perdaDados += integrity.contagens.csvLinhas - integrity.contagens.cacheLocal;
        integrity.erros.push(`Perda real detectada: ${perdaPercentual.toFixed(1)}% (${integrity.contagens.csvLinhas} → ${integrity.contagens.cacheLocal})`);
      }
    }

    // 7. Detectar recálculo de mainMarket
    if (cacheLocal && reidratacaoTest.beforeRefresh.length > 0) {
      const antes = reidratacaoTest.beforeRefresh;
      const depois = reidratacaoTest.afterRefresh;
      
      // Comparar alguns registros para detectar recálculo
      const sampleSize = Math.min(5, antes.length);
      for (let i = 0; i < sampleSize; i++) {
        if (antes[i] && depois[i]) {
          if (antes[i].mainMarket?.result !== depois[i].mainMarket?.result) {
            integrity.detalhes.recalculoMainMarket = true;
            integrity.erros.push('Recálculo detectado em mainMarket.result');
            break;
          }
          if (antes[i].mainMarket?.profit !== depois[i].mainMarket?.profit) {
            integrity.detalhes.recalculoProfit = true;
            integrity.erros.push('Recálculo detectado em mainMarket.profit');
            break;
          }
        }
      }
    }

    // Calcular score final
    let score = 100;
    
    if (!integrity.csvBrutoSalvo) score -= 20;
    if (!integrity.cacheLocalSalvo) score -= 20;
    if (!integrity.betresultsSalvo) score -= 20;
    if (!integrity.reidratacaoOk) score -= 20;
    
    // Penalidades diferenciadas para divergência
    if (integrity.divergenciaLocalRemoto) {
      if (integrity.divergenciaEsperada) {
        score -= 5; // penalidade menor para deduplicação esperada
      } else {
        score -= 15; // penalidade maior para divergência suspeita
      }
    }
    
    // Penalidades para problemas de dados
    if (integrity.detalhes.perdaDados > 0) score -= 10;
    if (integrity.detalhes.recalculoMainMarket) score -= 10;
    if (integrity.detalhes.recalculoProfit) score -= 10;

    integrity.scoreFinal = Math.max(0, score);

    // Determinar status
    if (integrity.scoreFinal >= 90) {
      integrity.status = 'integro';
    } else if (integrity.scoreFinal >= 60) {
      integrity.status = 'degradado';
    } else {
      integrity.status = 'critico';
    }

  } catch (error) {
    integrity.erros.push(`Erro geral: ${error}`);
    integrity.status = 'critico';
    integrity.scoreFinal = 0;
  }

  return integrity;
}

/**
 * Simular refresh e hidratação
 */
function simulateRefreshAndHydration(): {
  beforeRefresh: any[];
  afterRefresh: any[];
  hidratacaoOk: boolean;
} {
  // Capturar estado antes
  const beforeRefresh = JSON.parse(localStorage.getItem('lucrativo-processed-games') || '[]');
  
  // Simular limpeza do estado
  const tempBackup = localStorage.getItem('lucrativo-processed-games');
  localStorage.removeItem('lucrativo-processed-games');
  
  // Simular hidratação
  let afterRefresh: any[] = [];
  try {
    const stored = localStorage.getItem('lucrativo-processed-games');
    if (stored) {
      afterRefresh = JSON.parse(stored);
    }
    
    // Restaurar backup
    if (tempBackup) {
      localStorage.setItem('lucrativo-processed-games', tempBackup);
    }
    
  } catch (error) {
    // Restaurar backup em caso de erro
    if (tempBackup) {
      localStorage.setItem('lucrativo-processed-games', tempBackup);
    }
    afterRefresh = [];
  }
  
  return {
    beforeRefresh,
    afterRefresh,
    hidratacaoOk: beforeRefresh.length === afterRefresh.length
  };
}
