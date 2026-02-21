import { NextResponse } from "next/server";

const BASE_URL = "https://v3.football.api-sports.io";

export async function GET() {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY not configured" }, { status: 500 });
  }

  try {
    // 1. Check account status
    const statusRes = await fetch(`${BASE_URL}/status`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    const statusData = await statusRes.json();

    // 2. Check a known past fixture date (2026-02-13 = Europa League round)
    const fixtureRes = await fetch(`${BASE_URL}/fixtures?date=2026-02-13`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    const fixtureData = await fixtureRes.json();

    return NextResponse.json({
      account: statusData.response ?? statusData,
      errors: statusData.errors ?? {},
      fixtureTest: {
        date: "2026-02-13",
        results: fixtureData.results ?? 0,
        errors: fixtureData.errors ?? {},
        sample: (fixtureData.response ?? []).slice(0, 2).map((f: any) => ({
          id: f.fixture?.id,
          home: f.teams?.home?.name,
          away: f.teams?.away?.name,
          date: f.fixture?.date,
          league: f.league?.name,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
