import { NextRequest, NextResponse } from "next/server";
import { fetchFixturesByDate, fetchRealStatsForMatches, fetchFixtureStatistics, MatchRequest } from "../../../lib/footballApi";

export async function POST(req: NextRequest) {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 500 });
  }

  let body: { matches: MatchRequest[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { matches } = body;
  if (!Array.isArray(matches) || matches.length === 0) {
    return NextResponse.json({ error: "matches array required" }, { status: 400 });
  }

  try {
    const { stats, reqUsed, debug } = await fetchRealStatsForMatches(matches, apiKey);
    console.log(`[football-results] dates=${JSON.stringify(debug.dates)} fixtures=${debug.totalFixtures} matched=${stats.length} req=${reqUsed}`);
    return NextResponse.json({ stats, reqUsed, debug });
  } catch (e: any) {
    console.error("[football-results] error:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const fixtureId = searchParams.get("fixtureId");
  const date = searchParams.get("date");

  // 🆕 TAREFA 5.1: Endpoint para estatísticas de fixture específico
  if (fixtureId) {
    const id = parseInt(fixtureId);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ error: "Valid fixtureId required (positive integer)" }, { status: 400 });
    }

    try {
      const stats = await fetchFixtureStatistics(id, apiKey);
      if (!stats) {
        return NextResponse.json({ error: "Fixture statistics not found" }, { status: 404 });
      }

      console.log(`[football-statistics] fixture=${id} shotsHT=${stats.shotsHTHome + stats.shotsHTAway} cornersHT=${stats.cornersHTHome + stats.cornersHTAway}`);
      return NextResponse.json(stats);
    } catch (e: any) {
      console.error("[football-statistics] error:", e);
      return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
  }

  // Endpoint original para fixtures por data
  if (!date) return NextResponse.json({ error: "date param required (YYYY-MM-DD)" }, { status: 400 });

  try {
    const fixtures = await fetchFixturesByDate(date, apiKey);
    return NextResponse.json({ fixtures, count: fixtures.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
