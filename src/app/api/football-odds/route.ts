import { NextRequest, NextResponse } from "next/server";
import { fetchOddsForDate, fetchPreMatchOdds, fetchOddsForCsvGames } from "../../../lib/footballApi";
import { parseCSV } from "../../../engine";
import { loadServerCache, saveServerCache } from "../../../lib/fixtures-server-cache";

export async function GET(req: NextRequest) {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const fixtureId = searchParams.get("fixtureId");

  // Single fixture odds
  if (fixtureId) {
    const id = parseInt(fixtureId);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ error: "Valid fixtureId required" }, { status: 400 });
    }

    try {
      const odds = await fetchPreMatchOdds(id, apiKey);
      if (!odds) {
        return NextResponse.json({ error: "No odds found for this fixture" }, { status: 404 });
      }
      return NextResponse.json({ odds, reqUsed: 1 });
    } catch (e: any) {
      console.error("[football-odds] error:", e);
      return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
  }

  // All fixtures for a date
  if (!date) {
    return NextResponse.json({ error: "date or fixtureId param required" }, { status: 400 });
  }

  try {
    const { oddsMap, fixtureMap, reqUsed } = await fetchOddsForDate(date, apiKey);
    console.log(`[football-odds] date=${date} fixtures=${Object.keys(fixtureMap).length} withOdds=${Object.keys(oddsMap).length} req=${reqUsed}`);
    return NextResponse.json({ oddsMap, fixtureMap, reqUsed });
  } catch (e: any) {
    console.error("[football-odds] error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { csvText, date } = body;
    
    if (!csvText || !date) {
      return NextResponse.json({ error: "csvText and date required" }, { status: 400 });
    }

    // Parse CSV to get games
    const { games } = parseCSV(csvText);
    
    // 🆕 Verificar cache server-side ANTES de qualquer chamada à API
    const cached = loadServerCache(date, games);
    if (cached) {
      console.log(`[football-odds] Usando cache server-side — 0 requests gastos`);
      
      // Converter formato do cache para compatibilidade
      const fixtureMap: Record<string, number> = {};
      const matched = cached.fixtures.map(f => ({
        csvMatch: { home: f.homeTeam, away: f.awayTeam, hour: '', league: f.league },
        fixtureId: f.fixtureId,
        apiHomeTeam: f.homeTeam,
        apiAwayTeam: f.awayTeam,
        confidence: 1.0
      }));
      
      for (const match of matched) {
        fixtureMap[`${match.csvMatch.home} x ${match.csvMatch.away}`] = match.fixtureId;
      }
      
      return NextResponse.json({
        oddsMap: cached.oddsMap,
        fixtureMap,
        matched,
        unmatched: [],
        reqUsed: 0,
        fromCache: true,
      });
    }
    
    // Use optimized fetching (só executa se não tiver cache)
    const result = await fetchOddsForCsvGames(games, apiKey, date);
    
    console.log(`[football-odds] POST: Optimized odds for ${games.length} CSV games → ${result.matched.length} matched, ${result.reqUsed} requests`);
    
    // 🆕 Salvar no cache server-side após sucesso
    if (result.matched.length > 0) {
      const fixtures = result.matched.map(m => ({
        fixtureId: m.fixtureId,
        homeTeam: m.apiHomeTeam,
        awayTeam: m.apiAwayTeam,
        league: m.league || '',
        date: date
      }));
      
      saveServerCache(date, games, fixtures, result.oddsMap);
    }
    
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[football-odds] POST error:", e);
    
    // 🆕 Tratamento inteligente de rate limit
    const errorMessage = e?.message || String(e);
    if (errorMessage.includes("request limit for the day")) {
      console.log("[football-odds] COTA_DIARIA_ESGOTADA - abortando sem retentativas");
      return NextResponse.json({ 
        error: "COTA_DIARIA_ESGOTADA", 
        message: "Cota diária da API esgotada. Tente novamente amanhã após meia-noite UTC." 
      }, { status: 429 });
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
