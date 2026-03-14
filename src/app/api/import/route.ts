import { NextRequest, NextResponse } from 'next/server';
import { processNSGames, type BetResult } from '../../../lib/backtest';
import { supabaseServer, saveCsvDiario } from '../../../lib/supabase';
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

// Extrai data YYYY-MM-DD do CSV para persistência (padronizado)
function getImportDateISOFromCSV(csvText: string): string {
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
          const tzDate = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
          const dataISO = `${tzDate.getFullYear()}-${String(tzDate.getMonth()+1).padStart(2,'0')}-${String(tzDate.getDate()).padStart(2,'0')}`;
          return dataISO;
        }
      }
    }
  }
  // Fallback: data atual em YYYY-MM-DD
  const tzDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dataISO = `${tzDate.getFullYear()}-${String(tzDate.getMonth()+1).padStart(2,'0')}-${String(tzDate.getDate()).padStart(2,'0')}`;
  return dataISO;
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
          const { data, error: upsertErr } = await supabaseServer
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
        const csvDataISO = getImportDateISOFromCSV(csvText);
        console.log(`[IMPORT-API] Salvando CSV bruto para data ${csvDataISO}`);
        const csvSaved = await saveCsvDiario(csvDataISO, csvText);
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
        
        // 🆕 FASE 1: Matcher Otimizado - Obter fixture_ids da API
        console.log('[MATCHER] Buscando fixture_ids otimizados...');
        const csvDataISO = getImportDateISOFromCSV(csvText);
        const { fetchOddsForCsvGames } = await import('../../../lib/footballApi');
        const { matched, unmatched, reqUsed } = await fetchOddsForCsvGames(games, process.env.FOOTBALL_API_KEY!, csvDataISO);
        
        // Criar mapa de jogo → fixture_id
        const fixtureMap: Record<string, number> = {};
        matched.forEach(m => {
          fixtureMap[m.csvMatch.home + ' x ' + m.csvMatch.away] = m.fixtureId;
        });
        
        console.log(`[MATCHER] ✅ ${matched.length} jogos mapeados | ❌ ${unmatched.length} sem match | ${reqUsed} requisições usadas`);
        
        // Salvar apenas APPROVED no Supabase
        for (const game of games) {
          try {
            const matchInput = gameToMatchInput(game);
            const evals: TriggerEval[] = evaluateAllMarkets(matchInput);
            
            const approved = evals.filter(e => e.status === 'APPROVED');
            
            for (const eval_ of approved) {
              // 🚨 TEMPORÁRIO: Usar insert em vez de upsert até criar constraint única
              const { error: triggerErr } = await supabaseServer.from('trigger_suggestions').insert({
                fixture_id: fixtureMap[game.match] ?? null, // 🆕 Usar mapa otimizado
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
              });
              
              // TODO: Mudar para upsert quando a constraint única for criada
              // }, { onConflict: 'fixture_id,market_id' });
              
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
        
        // 5. 🆕 FASE 2: Motor Único - Salvar jogos processados no Supabase
        console.log('[PROCESSED-GAMES] Iniciando processamento completo para frontend...');
        let processedSavedCount = 0;
        let processedErrors = 0;

        try {
          // Importar funções de processamento
          const { classifyProfile } = await import('../../../lib/poisson-engine');
          const { computeScore, computeConfidence, suggestMainMarket, suggestCombo, getFavorito } = await import('../../../engine');
          
          // Processar todos os jogos com fixture_id mapeado
          const processedGames = [];
          for (const game of games) {
            try {
              const fixtureId = fixtureMap[game.match];
              if (!fixtureId) continue; // Pular jogos sem match
              
              // Criar rowValues a partir das propriedades do game
              const rowValues = Object.values(game).map(String);
              
              // Processamento completo (motor Poisson)
              const profile = classifyProfile(rowValues);
              const scoreResult = computeScore(game);
              const score = typeof scoreResult === 'number' ? scoreResult : scoreResult?.score || 0;
              const confResult = computeConfidence(game);
              const conf = confResult?.score || 0;
              const fav = getFavorito(game);
              
              // Gerar mercados principais e combos
              let mainMarket = null;
              let combo: any[] = [];
              
              // Pular perfis fracos
              if (profile !== 'generic' && profile !== 'low_goals') {
                mainMarket = suggestMainMarket(game);
                combo = suggestCombo(game);
              }
              
              // Estrutura para frontend
              const processedGame = {
                date: csvDataISO,
                fixture_id: fixtureId,
                match: game.match,
                home: game.home,
                away: game.away,
                league: game.league,
                hour: game.hour,
                status: game.status,
                profile,
                score,
                confidence: conf,
                mainMarket,
                combo,
                rowValues,
                oddsMap: {}, // 🆕 Será preenchido no frontend com odds em tempo real
                // 🆕 Dados do favorito para mercado de chutes
                favoriteTeam: fav.nome,
                afDiff: fav.afDiff,
                chFavGol: fav.chFavGol,
                // 🆕 Timestamp para cache
                processed_at: new Date().toISOString(),
              };
              
              processedGames.push(processedGame);
              
            } catch (gameErr: any) {
              console.error(`[PROCESSED-GAMES] Erro ao processar jogo ${game.match}:`, gameErr.message);
              processedErrors++;
            }
          }
          
          // 🚨 TEMPORÁRIO: Desabilitar processed_games até a tabela ser criada
          // TODO: Criar tabela processed_games no Supabase
          console.log('[PROCESSED-GAMES] ⚠️ Funcionalidade desabilitada temporariamente');
          console.log('[PROCESSED-GAMES] ⚠️ Execute o SQL em PROCESSED_GAMES_TABLE.sql para habilitar');
          
          // Salvar em lote no Supabase (desabilitado)
          // if (processedGames.length > 0) {
          //   const { error: processedErr } = await supabase
          //     .from('processed_games')
          //     .upsert(processedGames, { onConflict: 'fixture_id,date' });
          //   
          //   if (processedErr) {
          //     console.error('[PROCESSED-GAMES] Erro ao salvar jogos processados:', processedErr);
          //     processedErrors += processedGames.length;
          //   } else {
          //     processedSavedCount = processedGames.length;
          //     console.log(`[PROCESSED-GAMES] ✅ ${processedSavedCount} jogos processados salvos com sucesso`);
          //   }
          // }
          
        } catch (e: any) {
          console.error('[PROCESSED-GAMES] Erro geral:', e);
          errors.push(`Erro ao salvar jogos processados: ${e.message}`);
        }
        
      } catch (e: any) {
        console.error('[TRIGGER-SAVE] Erro geral:', e);
        errors.push(`Erro ao salvar trigger suggestions: ${e.message}`);
      }

      // 6. Salvar CSV diário (se houver jogos NS) - 🚨 TEMPORÁRIO DESABILITADO
      try {
        const nsGames = processedResults.filter(r => r.status === 'NS');
        if (nsGames.length > 0) {
          // 🚨 TEMPORÁRIO: Desabilitar salvamento do CSV diário
          // O CSV é muito grande e causa erro de índice (10808 bytes > 8191 max)
          console.log(`[CSV-DIARIO] ⚠️ Salvamento desabilitado - CSV muito grande (${csvText.length} chars)`);
          console.log(`[CSV-DIARIO] ⚠️ Encontrados ${nsGames.length} jogos NS`);
          
          // TODO: Implementar compressão ou armazenamento alternativo
          // await saveCsvDiario(csvText, getImportDateISOFromCSV(csvText));
          // console.log(`[IMPORT-API] CSV diário salvo com ${nsGames.length} jogos NS`);
        }
      } catch (e: any) {
        console.error('[CSV-DIARIO] Erro ao salvar CSV diário:', e);
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
