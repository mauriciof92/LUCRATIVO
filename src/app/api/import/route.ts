import { NextRequest, NextResponse } from 'next/server';
import { processNSGames, type BetResult } from '../../../lib/backtest';
import { supabase, saveCsvDiario } from '../../../lib/supabase';
import { generateDeterministicId } from '../../../lib/utils';
import { validateBetResult } from '../../../lib/canonical';
import { evaluateAllMarkets, TriggerEval } from '../../../lib/trigger-engine';
import { gameToMatchInput } from '../../../lib/trigger-adapter';

// Constante stake fixa R$25,00
const STAKE_FIXA = 25.00;

// Extrai data ISO ("2026-02-25") do campo hour do CSV
function getImportDateISO(hour: string): string {
  const h = (hour || '').trim();
  // DD/MM/YYYY
  const ddmmyyyy = h.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // DD-MM-YYYY
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

// Extrai data DDMM ("0803") do CSV para persistência
function getImportDateDDMM(csvText: string): string {
  const lines = csvText.split('\n');
  // Pular primeira linha (cabeçalho) e ir para a primeira linha de dados
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && !line.toLowerCase().includes('match')) {
      const fields = line.split(';');
      if (fields.length >= 4) {
        const hourField = fields[3]?.trim();
        if (hourField && hourField !== '"Hour"') {
          const iso = getImportDateISO(hourField);
          const date = new Date(iso);
          const ddmm = `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          return ddmm;
        }
      }
    }
  }
  // Fallback: data atual
  const now = new Date();
  return `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText } = body;

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json(
        { error: 'csvText é obrigatório e deve ser uma string' },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    let importedCount = 0;
    let totalCount = 0;

    try {
      // 1. Processar jogos usando engine existente
      const allResults = processNSGames(csvText);
      
      // 2. Adicionar stake fixa e validação canônica
      const processedResults = allResults
        .map(r => validateBetResult({ 
          ...r, 
          importDate: getImportDateISO(r.hour),
          mainMarket: { ...r.mainMarket, stake: STAKE_FIXA }, 
          combo: r.combo.map((c: any) => ({ ...c, stake: STAKE_FIXA })) 
        }))
        .filter((r): r is BetResult => r !== null);

      console.log(`[IMPORT-CANONICAL] ${processedResults.length}/${allResults.length} jogos válidos`);

      importedCount = processedResults.length;
      totalCount = processedResults.length;

      // 3. Fazer upsert em bet_results via Supabase
      try {
        // Mapear para formato do Supabase
        const toSupabaseRow = (r: BetResult) => ({
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

        const upsertRows = processedResults.map(toSupabaseRow);

        // Deduplicar por match+hour: FT > NS > outros, mais recente por último
        const deduped = Object.values(
          upsertRows.reduce((acc, row) => {
            const key = `${row.match}__${row.hour}`;
            const existing = acc[key];
            if (!existing) return { ...acc, [key]: row };
            
            // Prioridade: FT > qualquer outro status
            const existingIsFT = existing.status === 'FT';
            const rowIsFT = row.status === 'FT';
            
            if (!existingIsFT && rowIsFT) return { ...acc, [key]: row };
            return acc;
          }, {} as Record<string, typeof upsertRows[0]>)
        );

        console.log(`[IMPORT-API] Deduplicação: ${upsertRows.length} → ${deduped.length} registros`);

        // Salvar em lotes de 50
        const BATCH = 50;
        let totalSaved = 0;
        
        for (let i = 0; i < deduped.length; i += BATCH) {
          const batch = deduped.slice(i, i + BATCH);
          const { data, error: upsertErr } = await supabase
            .from('bet_results')
            .upsert(batch, { 
              onConflict: 'match,hour',
              ignoreDuplicates: false
            })
            .select('id');
            
          if (upsertErr) {
            console.error(`[IMPORT-API] Erro no lote ${i}-${i+BATCH}:`, upsertErr.message);
            errors.push(`Erro ao salvar lote ${i}-${i+BATCH}: ${upsertErr.message}`);
          } else {
            totalSaved += data?.length ?? batch.length;
            console.log(`[IMPORT-API] Lote ${i}-${i+BATCH}: OK (${data?.length ?? batch.length} registros)`);
          }
        }
        
        if (totalSaved !== deduped.length) {
          errors.push(`Salvo parcialmente: ${totalSaved}/${deduped.length}. Verifique conexão.`);
        }
        
      } catch (e: any) {
        console.error('[IMPORT-API] Falha crítica no Supabase:', e?.message ?? e);
        errors.push('Falha ao salvar no Supabase: ' + (e?.message ?? 'Erro desconhecido'));
      }

      // 4. Fazer upsert em csv_diario
      try {
        const csvDataDDMM = getImportDateDDMM(csvText);
        console.log(`[IMPORT-API] Salvando CSV bruto para data ${csvDataDDMM}`);
        const csvSaved = await saveCsvDiario(csvDataDDMM, csvText);
      } catch (e: any) {
        console.error('[IMPORT-API] Erro geral no Supabase:', e);
        errors.push(`Erro no Supabase: ${e.message}`);
      }

      // 4. Salvar trigger suggestions no Supabase
      console.log('[TRIGGER-SAVE] Iniciando salvamento das avaliações do motor Poisson...');
      let triggerSavedCount = 0;
      let triggerErrors = 0;

      try {
        // Processar jogos originais para extrair trigger evaluations
        const { parseCSV } = await import('../../../engine');
        const { games } = parseCSV(csvText);
        
        // Salvar apenas APPROVED no Supabase
        for (const game of games) {
          try {
            const matchInput = gameToMatchInput(game);
            const evals: TriggerEval[] = evaluateAllMarkets(matchInput);
            
            const approved = evals.filter(e => e.status === 'APPROVED');
            
            for (const eval_ of approved) {
              const { error: triggerErr } = await supabase.from('trigger_suggestions').upsert({
                fixture_id: (game as any).fixtureId ?? null,
                match_label: game.match,
                market_id: eval_.marketId,
                data_mode: matchInput.dataMode ?? 'csv_only',
                lambda_home: matchInput.lambdaHomeFT ?? null,
                lambda_away: matchInput.lambdaAwayFT ?? null,
                lambda_total: matchInput.exGTotal ?? null,
                model_prob: eval_.modelProb,
                implied_prob: eval_.impliedProb,
                fair_odd: eval_.fairOdd,
                captured_odd: null, // preencher quando apostar
                edge_pct: eval_.edgePct,
                confidence_score: eval_.confidenceScore,
                status: eval_.status,
                reason_codes: eval_.reasons,
              }, { onConflict: 'fixture_id,market_id' });
              
              if (triggerErr) {
                console.error(`[TRIGGER-SAVE] Erro ao salvar ${game.match} - ${eval_.marketId}:`, triggerErr.message);
                triggerErrors++;
              } else {
                triggerSavedCount++;
              }
            }
          } catch (gameErr: any) {
            console.error(`[TRIGGER-SAVE] Erro ao processar jogo ${game.match}:`, gameErr.message);
            triggerErrors++;
          }
        }
        
        console.log(`[TRIGGER-SAVE] Concluído: ${triggerSavedCount} avaliações salvas, ${triggerErrors} erros`);
        
      } catch (e: any) {
        console.error('[TRIGGER-SAVE] Erro geral:', e);
        errors.push(`Erro ao salvar trigger suggestions: ${e.message}`);
      }

      // 5. Salvar CSV diário (se houver jogos NS)
      try {
        const nsGames = processedResults.filter(r => r.status === 'NS');
        if (nsGames.length > 0) {
          await saveCsvDiario(csvText, getImportDateDDMM(csvText));
          console.log(`[IMPORT-API] CSV diário salvo com ${nsGames.length} jogos NS`);
        }
      } catch (e: any) {
        console.error('[IMPORT-API] Erro ao salvar CSV diário:', e);
        errors.push(`Erro ao salvar CSV diário: ${e.message}`);
      }

    } catch (e: any) {
      console.error('[IMPORT-API] Erro ao processar CSV:', e);
      errors.push('Erro ao processar CSV: ' + (e?.message ?? 'Erro desconhecido'));
    }

    return NextResponse.json({
      imported: importedCount,
      total: totalCount,
      errors
    });

  } catch (e: any) {
    console.error('[IMPORT-API] Erro geral:', e);
    return NextResponse.json(
      { error: 'Erro interno do servidor: ' + (e?.message ?? 'Erro desconhecido') },
      { status: 500 }
    );
  }
}
