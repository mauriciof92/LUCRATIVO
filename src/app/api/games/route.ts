import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { generateDeterministicId } from '../../../lib/utils';
import type { BetResult } from '../../../lib/backtest';
import { validateBetResult } from '../../../lib/canonical';
import { resolveMarketResult } from '../../../lib/backtest';

// Forçar rota dinâmica
export const dynamic = 'force-dynamic';

// Constante stake fixa R$25,00
const STAKE_FIXA = 25.00;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);
    const status = searchParams.get('status');

    // Construir query Supabase
    let query = supabase
      .from('bet_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Aplicar filtros
    if (status) {
      query = query.eq('status', status);
    }

    if (date) {
      // Converter YYYY-MM-DD para DDMM
      const dateObj = new Date(date);
      if (!isNaN(dateObj.getTime())) {
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const ddmm = `${dd}${mm}`;
        query = query.ilike('hour', `%${ddmm}%`);
      }
    }

    const { data: betData, error } = await query;

    if (error) {
      console.error('[GAMES-API] Erro na consulta:', error);
      return NextResponse.json(
        { error: 'Erro ao buscar jogos: ' + error.message },
        { status: 500 }
      );
    }

    if (!betData || betData.length === 0) {
      return NextResponse.json({ games: [], total: 0 });
    }

    // Mapear para BetResult usando mesma lógica do useBacktest hydrate
    const STAKE_FIXA = 25.00;
    const mapped: BetResult[] = betData.map(row => {
      let favorito: any = { lado: '', nome: '', nomeUnder: '', afFav: 0, afUnder: 0, afDiff: 0, chFavGol: 0, chFavTot: 0, chUnderGol: 0, chUnderTot: 0, cantFavHT: 0, cantUnderHT: 0, cantFavFT: 0, gol05HTFav: 0 };
      try { 
        const f = row.favorito_data ? JSON.parse(row.favorito_data) : null; 
        if (f?.nome) favorito = f; 
      } catch {}

      let combo: any[] = [];
      try { 
        const c = row.combo_data ? JSON.parse(row.combo_data) : null; 
        if (Array.isArray(c)) combo = c; 
      } catch {}

      let poison;
      try { 
        poison = row.poison_data ? JSON.parse(row.poison_data) : undefined; 
      } catch {}

      // Recalcular resultado para jogos FT que ainda estão como 'no-odd'
      const isFT = (row.status ?? '') === 'FT';
      const storedResult = row.main_market_result ?? 'no-odd';
      const label = row.main_market_label ?? '';
      const rHome = row.result_home ?? 0;
      const rAway = row.result_away ?? 0;
      let mainResult = storedResult;
      let mainProfit = Number(row.main_market_profit ?? 0);
      if (isFT && (storedResult === 'no-odd' || storedResult === 'pending_manual') && label) {
        mainResult = resolveMarketResult(label, { resultHome: rHome, resultAway: rAway });
        const odd = Number(row.main_market_odd ?? 0);
        mainProfit = mainResult === 'win' ? odd * STAKE_FIXA - STAKE_FIXA
                   : mainResult === 'lose' ? -STAKE_FIXA : 0;
      }

      // Recalcular combo results também
      const resolvedCombo = combo.map((c: any) => {
        if (isFT && (c.result === 'no-odd' || c.result === 'pending_manual') && c.label) {
          const cResult = resolveMarketResult(c.label, { resultHome: rHome, resultAway: rAway });
          const cOdd = Number(c.odd ?? 0);
          const cProfit = cResult === 'win' ? cOdd * STAKE_FIXA - STAKE_FIXA
                        : cResult === 'lose' ? -STAKE_FIXA : 0;
          return { ...c, result: cResult, profit: cProfit };
        }
        return c;
      });

      return {
        // ID determinístico para consistência
        id: generateDeterministicId(row.match, row.hour),
        match: row.match, 
        league: row.league ?? '', 
        hour: row.hour ?? '',
        status: row.status ?? '', 
        resultHome: rHome, 
        resultAway: rAway,
        profile: row.profile ?? '', 
        score: Number(row.score ?? 0), 
        confidence: Number(row.confidence ?? 0),
        created_at: row.created_at ?? '', 
        favorito, 
        poison,
        mainMarket: {
          label, 
          odd: Number(row.main_market_odd ?? 0),
          minOdd: 0, 
          stake: STAKE_FIXA, 
          result: mainResult as any,
          profit: mainProfit, 
          hasValue: false,
        },
        combo: resolvedCombo, 
        ftGoals: rHome + rAway,
      };
    });

    // Resolver resultados para jogos FT antes da validação
    const resolved = mapped.map(game => {
      if (game.status === 'FT' && (game.mainMarket.result === 'no-odd' || game.mainMarket.result === 'pending_manual')) {
        const resolvedResult = resolveMarketResult(
          game.mainMarket.label,
          { resultHome: game.resultHome, resultAway: game.resultAway }
        );
        const profit = resolvedResult === 'win'
          ? ((game.mainMarket.odd || 0) * STAKE_FIXA) - STAKE_FIXA
          : resolvedResult === 'lose' ? -STAKE_FIXA : 0;
        
        return {
          ...game,
          mainMarket: {
            ...game.mainMarket,
            result: resolvedResult,
            profit: profit
          }
        };
      }
      return game;
    });

    const validated = resolved
      .map(g => validateBetResult(g))
      .filter((g): g is BetResult => g !== null);

    return NextResponse.json({
      games: validated,
      total: validated.length
    });

  } catch (e: any) {
    console.error('[GAMES-API] Erro geral:', e);
    return NextResponse.json(
      { error: 'Erro interno do servidor: ' + (e?.message ?? 'Erro desconhecido') },
      { status: 500 }
    );
  }
}
