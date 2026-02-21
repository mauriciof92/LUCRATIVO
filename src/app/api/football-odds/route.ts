import { NextRequest, NextResponse } from "next/server";
import { fetchOddsForDate, fetchPreMatchOdds } from "../../../lib/footballApi";

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
