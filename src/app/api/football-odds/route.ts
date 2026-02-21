import { NextRequest, NextResponse } from "next/server";
import { fetchOddsForDate, fetchPreMatchOdds, fetchOddsForCsvGames } from "../../../lib/footballApi";
import { parseCSV } from "../../../engine";

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
    
    // Use optimized fetching
    const result = await fetchOddsForCsvGames(games, apiKey, date);
    
    console.log(`[football-odds] POST: Optimized odds for ${games.length} CSV games → ${result.matched.length} matched, ${result.reqUsed} requests`);
    
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[football-odds] POST error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
