const BASE_URL = "https://v3.football.api-sports.io";

import { fetchOddsForCsvMatches, type CsvMatch } from "./fixture-matcher";

export interface RealStats {
  matchKey: string;
  homeTeam: string;
  awayTeam: string;
  /** Total shots on goal HT by the favorite team (afH >= afA → home, else away) */
  shotsHTFav: number;
  /** Total shots on goal HT by opponent */
  shotsHTOpp: number;
  /** Total shots (on + off) HT by favorite */
  totalShotsHTFav: number;
  /** Corners earned by favorite in HT */
  cornersHTFav: number;
  /** Total corners HT (both teams) */
  cornersHTTotal: number;
  /** Total corners FT (both teams) */
  cornersFTTotal: number;
  /** Goals scored HT by home team */
  goalsHTHome: number;
  /** Goals scored HT by away team */
  goalsHTAway: number;
  /** Confidence of the name-matching (0-1) */
  matchConfidence: number;
  /** Source of shots HT data: "api" = real API-Football, "avg" = PackBall historical average */
  shotsHTSource: "api" | "avg";
  /** Source of corners data: "api" = real API-Football events, "avg" = no real data */
  cornersSource: "api" | "avg";
}

export interface MatchRequest {
  homeTeam: string;
  awayTeam: string;
  /** ISO date substring, e.g. "2026-02-19" */
  date: string;
  afH: number;
  afA: number;
}

export interface FixtureStatistics {
  fixtureId: number;
  shotsHTHome: number;
  shotsHTAway: number;
  cornersHTHome: number;
  cornersHTAway: number;
  shotsHTSource: "api" | "avg";
  cornersSource: "api" | "avg";
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function fuzzyMatchTeam(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(na, nb) / maxLen;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function apiFetch(path: string, apiKey: string, attempt = 0): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${path}`);
  const data = await res.json();

  // Handle rate limit: retry up to 3 times with exponential backoff
  const rateErr = data.errors?.rateLimit ?? data.errors?.requests;
  if (rateErr && attempt < 3) {
    const wait = (attempt + 1) * 8000; // 8s, 16s, 24s
    console.warn(`[API-Football] rate limit on ${path}, retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
    await sleep(wait);
    return apiFetch(path, apiKey, attempt + 1);
  }

  if (data.errors && Object.keys(data.errors).length > 0 && !rateErr) {
    console.warn(`[API-Football] errors on ${path}:`, JSON.stringify(data.errors));
  }
  return data;
}

// ─── public functions ─────────────────────────────────────────────────────────

export async function fetchFixturesByDate(
  date: string,
  apiKey: string
): Promise<Array<{ id: number; home: string; away: string; homeId: number; awayId: number }>> {
  const data = await apiFetch(`/fixtures?date=${date}`, apiKey);
  console.log(`[API-Football] fetchFixturesByDate ${date}: results=${data.results ?? 0} errors=${JSON.stringify(data.errors ?? {})}`);
  return (data.response ?? []).map((f: any) => ({
    id: f.fixture?.id as number,
    home: f.teams?.home?.name ?? "",
    away: f.teams?.away?.name ?? "",
    homeId: f.teams?.home?.id as number,
    awayId: f.teams?.away?.id as number,
  }));
}

/** Uses /fixtures/events to count HT events (elapsed ≤ 45) */
async function fetchHalfTimeEvents(
  fixtureId: number,
  homeId: number,
  awayId: number,
  apiKey: string
): Promise<{
  shotsHTHome: number; shotsHTAway: number;
  totalShotsHTHome: number; totalShotsHTAway: number;
  cornersHTHome: number; cornersHTAway: number;
  cornersFTHome: number; cornersFTAway: number;
  goalsHTHome: number; goalsHTAway: number;
}> {
  const [evtData, statData] = await Promise.all([
    apiFetch(`/fixtures/events?fixture=${fixtureId}`, apiKey),
    apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, apiKey),
  ]);

  const events: any[] = evtData.response ?? [];

  // Count HT events (elapsed <= 45, extra null or 0)
  const isHT = (e: any) => {
    const el = e.time?.elapsed ?? 99;
    const ex = e.time?.extra ?? 0;
    return el <= 45 && (ex === 0 || ex === null);
  };

  const shotsHTHome = events.filter(e => isHT(e) && e.team?.id === homeId && e.type === "Goal" || (isHT(e) && e.team?.id === homeId && e.type === "subst" === false && e.detail?.toLowerCase().includes("shot on target"))).length;

  // Simpler: use statistics (full match) for FT totals, events for HT totals
  const stats: any[] = statData.response ?? [];

  const getStatVal = (teamId: number, type: string): number => {
    const ts = stats.find((s: any) => s.team?.id === teamId);
    if (!ts) return 0;
    const stat = (ts.statistics ?? []).find((s: any) => s.type === type);
    const v = stat?.value;
    if (v === null || v === undefined) return 0;
    return typeof v === "number" ? v : parseInt(String(v), 10) || 0;
  };

  // HT from events
  let cornersHTHome = 0, cornersHTAway = 0, goalsHTHome = 0, goalsHTAway = 0;
  let shotsOnGoalHTHome = 0, shotsOnGoalHTAway = 0;
  let totalShotsHTHome = 0, totalShotsHTAway = 0;

  for (const e of events) {
    if (!isHT(e)) continue;
    const tid = e.team?.id;
    const type = (e.type ?? "").toLowerCase();
    const detail = (e.detail ?? "").toLowerCase();

    if (type === "goal" && detail !== "own goal" && detail !== "penalty") {
      if (tid === homeId) goalsHTHome++;
      else if (tid === awayId) goalsHTAway++;
    }
    if (type === "goal" && detail !== "missed penalty") {
      // counted above
    }
  }

  // 🆕 Mapeamento correto para HT: shots_on_goal + shots_off_goal do 1º tempo
  // API-Football events não incluem shots bem. Usar statistics para aproximação HT.
  const cornersFTHome = getStatVal(homeId, "Corner Kicks");
  const cornersFTAway = getStatVal(awayId, "Corner Kicks");
  const shotsFTHome = getStatVal(homeId, "Shots on Goal");
  const shotsFTAway = getStatVal(awayId, "Shots on Goal");
  const totalFTHome = getStatVal(homeId, "Total Shots");      // shots_on_goal + shots_off_goal
  const totalFTAway = getStatVal(awayId, "Total Shots");      // shots_on_goal + shots_off_goal

  // Use events corners for HT
  for (const e of events) {
    if (!isHT(e)) continue;
    const tid = e.team?.id;
    const type = (e.type ?? "").toLowerCase();
    if (type === "corner") {
      if (tid === homeId) cornersHTHome++;
      else if (tid === awayId) cornersHTAway++;
    }
  }

  // 🆕 Log de validação - Exibir objeto completo da API para auditoria
  console.log(`[API-DEBUG] HT Events para fixture ${fixtureId}:`, {
    totalEvents: events.length,
    htEvents: events.filter(isHT).length,
    htEventsDetail: events.filter(isHT).slice(0, 5), // Primeiros 5 eventos HT
    stats: stats.slice(0, 2), // Primeiras 2 estatísticas
    shotsHTHome,
    shotsHTAway: shotsFTAway, // Corrigido: usar shotsFTAway
    totalShotsHTHome,
    totalShotsHTAway,
    cornersHTHome,
    cornersHTAway,
    goalsHTHome,
    goalsHTAway
  });

  return {
    shotsHTHome: 0,
    shotsHTAway: 0,
    totalShotsHTHome: 0,
    totalShotsHTAway: 0,
    cornersHTHome,
    cornersHTAway,
    cornersFTHome,
    cornersFTAway,
    goalsHTHome,
    goalsHTAway,
  };
}

// ─── API-Football: shots HT via statistics half=1 ────────────────────────────

async function fetchShotsHTFromApi(
  fixtureId: number,
  homeId: number,
  awayId: number,
  apiKey: string
): Promise<{ shotsHTHome: number; shotsHTAway: number } | null> {
  try {
    const data = await apiFetch(`/fixtures/statistics?fixture=${fixtureId}&half=1`, apiKey);
    const stats: any[] = data.response ?? [];
    if (!stats.length) return null;

    const getVal = (teamId: number, type: string): number => {
      const ts = stats.find((s: any) => s.team?.id === teamId);
      if (!ts) return 0;
      const stat = (ts.statistics ?? []).find((s: any) => s.type === type);
      const v = stat?.value;
      if (v === null || v === undefined) return 0;
      return typeof v === "number" ? v : parseInt(String(v), 10) || 0;
    };

    const shotsHTHome = getVal(homeId, "Shots on Goal");
    const shotsHTAway = getVal(awayId, "Shots on Goal");
    console.log(`[API-Football] Shots HT half=1 fixture=${fixtureId}: home=${shotsHTHome} away=${shotsHTAway}`);
    return { shotsHTHome, shotsHTAway };
  } catch {
    return null;
  }
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function fetchRealStatsForMatches(
  matches: MatchRequest[],
  apiKey: string
): Promise<{ stats: RealStats[]; reqUsed: number; debug: { totalFixtures: number; dates: string[] } }> {
  if (!matches.length) return { stats: [], reqUsed: 0, debug: { totalFixtures: 0, dates: [] } };

  // Deduplicate dates without Set (tsconfig target: es5)
  const dateSeen: Record<string, boolean> = {};
  const dates: string[] = [];
  for (const m of matches) {
    const d = m.date.substring(0, 10);
    if (!dateSeen[d]) { dateSeen[d] = true; dates.push(d); }
  }
  let reqUsed = 0;

  // Fetch fixture lists per date via API-Football (1 req each)
  const fixturesByDate: Record<string, Array<{ id: number; home: string; away: string; homeId: number; awayId: number }>> = {};
  for (const date of dates) {
    fixturesByDate[date] = await fetchFixturesByDate(date, apiKey);
    reqUsed++;
  }

  const results: RealStats[] = [];

  for (const match of matches) {
    const dateKey = match.date.substring(0, 10);
    const fixtures = fixturesByDate[dateKey] ?? [];

    // Find best matching fixture in API-Football (may be empty on free plan for historical dates)
    let bestFixture: typeof fixtures[0] | null = null;
    let bestScore = 0;
    for (const f of fixtures) {
      const combined = (fuzzyMatchTeam(match.homeTeam, f.home) + fuzzyMatchTeam(match.awayTeam, f.away)) / 2;
      if (combined > bestScore && combined >= 0.42) { bestScore = combined; bestFixture = f; }
    }

    // Usar apenas API-Football — sem SofaScore
    if (!bestFixture) continue; // sem fixture encontrado, pular

    const [shotsData, htData] = await Promise.all([
      fetchShotsHTFromApi(bestFixture.id, bestFixture.homeId, bestFixture.awayId, apiKey),
      fetchHalfTimeEvents(bestFixture.id, bestFixture.homeId, bestFixture.awayId, apiKey),
    ]);
    reqUsed += 3; // statistics?half=1 + events + statistics

    const hasApiData = htData !== null;
    const hasShotsData = shotsData !== null && (shotsData.shotsHTHome > 0 || shotsData.shotsHTAway > 0);

    const isFavHome = match.afH >= match.afA;
    const shotsHTHome = hasShotsData ? shotsData!.shotsHTHome : 0;
    const shotsHTAway = hasShotsData ? shotsData!.shotsHTAway : 0;

    console.log(`[API-Football] RealStats ${match.homeTeam} vs ${match.awayTeam}: shotsHT=${shotsHTHome}/${shotsHTAway} corners=${htData?.cornersHTHome ?? 0}/${htData?.cornersHTAway ?? 0}`);

    results.push({
      matchKey:        `${match.homeTeam}|${match.awayTeam}`,
      homeTeam:        match.homeTeam,
      awayTeam:        match.awayTeam,
      shotsHTFav:      isFavHome ? shotsHTHome : shotsHTAway,
      shotsHTOpp:      isFavHome ? shotsHTAway : shotsHTHome,
      totalShotsHTFav: isFavHome ? (htData?.totalShotsHTHome ?? 0) : (htData?.totalShotsHTAway ?? 0),
      cornersHTFav:    isFavHome ? (htData?.cornersHTHome ?? 0)    : (htData?.cornersHTAway ?? 0),
      cornersHTTotal:  (htData?.cornersHTHome ?? 0) + (htData?.cornersHTAway ?? 0),
      cornersFTTotal:  (htData?.cornersFTHome ?? 0) + (htData?.cornersFTAway ?? 0),
      goalsHTHome:     htData?.goalsHTHome ?? 0,
      goalsHTAway:     htData?.goalsHTAway ?? 0,
      matchConfidence: bestScore,
      shotsHTSource:   hasShotsData ? "api" : "avg",
      cornersSource:   hasApiData ? "api" : "avg",
    });
  }

  const totalFixtures = Object.values(fixturesByDate).reduce((s, f) => s + f.length, 0);
  return { stats: results, reqUsed, debug: { totalFixtures, dates } };
}

// 🆕 TAREFA 5.1: Função para buscar estatísticas de um fixture específico
export async function fetchFixtureStatistics(fixtureId: number, apiKey: string): Promise<FixtureStatistics | null> {
  try {
    // Fallback para API-Football (SofaScore precisa de date/teams, não apenas fixtureId)
    const [evtData, statData] = await Promise.all([
      apiFetch(`/fixtures/events?fixture=${fixtureId}`, apiKey),
      apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, apiKey),
    ]);

    const events: any[] = evtData.response ?? [];
    const stats: any[] = statData.response ?? [];

    // Helper para verificar se é do primeiro tempo
    const isHT = (e: any) => {
      const el = e.time?.elapsed ?? 99;
      const ex = e.time?.extra ?? 0;
      return el <= 45 && (ex === 0 || ex === null);
    };

    // Extrair dados do primeiro tempo dos events
    const shotsHTHome = events.filter(e => isHT(e) && e.team?.id === getHomeTeamId(stats) && 
      (e.type === "Goal" || (e.detail?.toLowerCase().includes("shot on target")))).length;
    const shotsHTAway = events.filter(e => isHT(e) && e.team?.id === getAwayTeamId(stats) && 
      (e.type === "Goal" || (e.detail?.toLowerCase().includes("shot on target")))).length;

    // Corners do primeiro tempo (events)
    const cornersHTHome = events.filter(e => isHT(e) && e.team?.id === getHomeTeamId(stats) && e.type === "Corner Kick").length;
    const cornersHTAway = events.filter(e => isHT(e) && e.team?.id === getAwayTeamId(stats) && e.type === "Corner Kick").length;

    return {
      fixtureId,
      shotsHTHome,
      shotsHTAway,
      cornersHTHome,
      cornersHTAway,
      shotsHTSource: "api",
      cornersSource: "api",
    };
  } catch (error) {
    console.error(`[fetchFixtureStatistics] Error for fixture ${fixtureId}:`, error);
    return null;
  }
}

// Helper para extrair team IDs das estatísticas
function getHomeTeamId(stats: any[]): number {
  const firstStat = stats[0];
  return firstStat?.team?.id || 0;
}

function getAwayTeamId(stats: any[]): number {
  const secondStat = stats[1];
  return secondStat?.team?.id || 0;
}

// ─── PRE-MATCH ODDS ──────────────────────────────────────────────────────────

export interface PreMatchOdds {
  fixtureId: number;
  bookmaker: string;
  markets: Record<string, number>; // "Over 1.5 FT" → 1.04, "Over 2.5 FT" → 1.65, etc.
}

/**
 * Mapeamento de Bet IDs da API-Football para labels do engine.
 * - bet 5  = Over/Under (gols FT)
 * - bet 26 = Over/Under First Half (gols HT)
 * - bet 28 = Both Teams To Score
 * - bet 45 = Total Corners Over/Under (FT)
 * - bet 64 = Home Team Total Shots On Target O/U
 * - bet 65 = Away Team Total Shots On Target O/U
 */
const ODDS_BET_IDS = [5, 26, 28, 45, 64, 65];

function mapOddsToMarkets(bets: any[], homeTeam: string, awayTeam: string): Record<string, number> {
  const markets: Record<string, number> = {};

  for (const bet of bets) {
    const betId = bet.id;
    const values = bet.values ?? [];

    for (const v of values) {
      const label = String(v.value ?? "");
      const odd = parseFloat(v.odd);
      if (isNaN(odd) || odd <= 1) continue;

      // bet 5: Over/Under FT (e.g. "Over 1.5", "Over 2.5")
      if (betId === 5 && label.startsWith("Over")) {
        const line = label.replace("Over ", "");
        markets[`Over ${line} FT`] = odd;
      }

      // bet 26: Over/Under First Half (gols HT)
      if (betId === 26 && label.startsWith("Over")) {
        const line = label.replace("Over ", "");
        markets[`Over ${line} Gols HT`] = odd;
      }

      // bet 28: BTTS
      if (betId === 28) {
        if (label === "Yes") markets["Ambas Marcam — Sim"] = odd;
      }

      // bet 45: Total Corners O/U FT
      if (betId === 45 && label.startsWith("Over")) {
        const line = label.replace("Over ", "");
        markets[`Over ${line} Cantos FT`] = odd;
      }

      // bet 64: Home Shots on Target O/U
      if (betId === 64 && label.startsWith("Over")) {
        const line = label.replace("Over ", "");
        markets[`${homeTeam} Finalizações Over ${line}`] = odd;
      }

      // bet 65: Away Shots on Target O/U
      if (betId === 65 && label.startsWith("Over")) {
        const line = label.replace("Over ", "");
        markets[`${awayTeam} Finalizações Over ${line}`] = odd;
      }
    }
  }

  return markets;
}

/** Fetch pre-match odds for a specific fixture from API-Football (bookmaker=8 = Bet365) */
export async function fetchPreMatchOdds(
  fixtureId: number,
  apiKey: string,
  bookmaker: number = 8
): Promise<PreMatchOdds | null> {
  try {
    const data = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=${bookmaker}`, apiKey);
    const response = data.response ?? [];
    if (response.length === 0) return null;

    const fixture = response[0];
    const bookmakerData = fixture.bookmakers?.[0];
    if (!bookmakerData) return null;

    const homeTeam = fixture.league?.name ? "" : ""; // placeholder, we get from fixture
    const awayTeam = "";

    const bets = bookmakerData.bets ?? [];
    const filteredBets = bets.filter((b: any) => ODDS_BET_IDS.includes(b.id));
    const markets = mapOddsToMarkets(filteredBets, homeTeam, awayTeam);

    return {
      fixtureId,
      bookmaker: bookmakerData.name ?? "Bet365",
      markets,
    };
  } catch (e) {
    console.error(`[fetchPreMatchOdds] Error for fixture ${fixtureId}:`, e);
    return null;
  }
}

/** Fetch odds for all fixtures on a given date. Returns map of fixtureId → markets */
export async function fetchOddsForDate(
  date: string,
  apiKey: string
): Promise<{ oddsMap: Record<number, PreMatchOdds>; fixtureMap: Record<string, number>; reqUsed: number }> {
  const fixtures = await fetchFixturesByDate(date, apiKey);
  let reqUsed = 1; // 1 for fetchFixturesByDate

  const oddsMap: Record<number, PreMatchOdds> = {};
  const fixtureMap: Record<string, number> = {}; // "Home x Away" → fixtureId

  for (const f of fixtures) {
    fixtureMap[`${f.home} x ${f.away}`] = f.id;
  }

  // Fetch odds for each fixture (batched with small delay to respect rate limits)
  for (const f of fixtures) {
    const odds = await fetchPreMatchOdds(f.id, apiKey);
    reqUsed++;

    if (odds) {
      // Re-map with real team names for shots markets
      const betsRaw = odds.markets;
      const remapped: Record<string, number> = {};
      for (const [key, val] of Object.entries(betsRaw)) {
        // Replace empty team names with real ones
        let newKey = key;
        if (key.includes(" Finalizações Over") && !key.includes(f.home) && !key.includes(f.away)) {
          // Generic case — keep as is
        }
        remapped[newKey] = val;
      }

      // Add home/away team-specific shot markets
      const homeShotsKey = Object.keys(betsRaw).find(k => k === `${f.home} Finalizações Over`);
      const awayShotsKey = Object.keys(betsRaw).find(k => k === `${f.away} Finalizações Over`);

      oddsMap[f.id] = { ...odds, markets: remapped };
    }

    // Small delay between requests to be respectful
    if (reqUsed % 5 === 0) await sleep(1000);
  }

  console.log(`[fetchOddsForDate] ${date}: ${fixtures.length} fixtures, ${Object.keys(oddsMap).length} with odds, ${reqUsed} API calls`);
  return { oddsMap, fixtureMap, reqUsed };
}

/** 🆕 Optimized: Fetch odds only for CSV games (21 requests vs 1461) */
export async function fetchOddsForCsvGames(
  csvGames: any[], // games from parseCSV
  apiKey: string,
  date: string
): Promise<{ oddsMap: Record<number, PreMatchOdds>; fixtureMap: Record<string, number>; reqUsed: number; matched: any[]; unmatched: any[] }> {
  // Convert CSV games to CsvMatch format
  const csvMatches: CsvMatch[] = csvGames.map(g => ({
    home: g.home || '',
    away: g.away || '',
    hour: g.hour || '',
    league: g.league || '',
  }));

  // Use the optimized matcher
  const { odds, matched, unmatched, requestsUsed } = await fetchOddsForCsvMatches(csvMatches, apiKey, date);

  // Convert to existing format for compatibility
  const oddsMap: Record<number, PreMatchOdds> = {};
  const fixtureMap: Record<string, number> = {};

  for (const match of matched) {
    fixtureMap[`${match.csvMatch.home} x ${match.csvMatch.away}`] = match.fixtureId;
    
    if (odds[match.fixtureId]) {
      const apiOdds = odds[match.fixtureId];
      const markets: Record<string, number> = {};
      
      // Map API odds to our format
      if (apiOdds.bookmakers?.[0]?.bets) {
        for (const bet of apiOdds.bookmakers[0].bets) {
          for (const value of bet.values || []) {
            const label = String(value.value || "");
            const odd = parseFloat(value.odd || "0");
            if (odd > 1) {
              // Map to our expected format
              if (bet.id === 5 && label.startsWith("Over")) {
                markets[`Over ${label.replace("Over ", "")} FT`] = odd;
              }
              if (bet.id === 26 && label.startsWith("Over")) {
                markets[`Over ${label.replace("Over ", "")} Gols HT`] = odd;
              }
              if (bet.id === 28 && label === "Yes") {
                markets["Ambas Marcam — Sim"] = odd;
              }
              if (bet.id === 45 && label.startsWith("Over")) {
                markets[`Over ${label.replace("Over ", "")} Cantos FT`] = odd;
              }
              if (bet.id === 64 && label.startsWith("Over")) {
                markets[`${match.apiHomeTeam} Finalizações Over ${label.replace("Over ", "")}`] = odd;
              }
              if (bet.id === 65 && label.startsWith("Over")) {
                markets[`${match.apiAwayTeam} Finalizações Over ${label.replace("Over ", "")}`] = odd;
              }
            }
          }
        }
      }
      
      oddsMap[match.fixtureId] = {
        fixtureId: match.fixtureId,
        bookmaker: "Bet365",
        markets,
      };
    }
  }

  console.log(`[fetchOddsForCsvGames] Optimized: ${csvMatches.length} CSV games → ${matched.length} matched → ${Object.keys(oddsMap).length} odds, ${requestsUsed} requests`);
  
  return { oddsMap, fixtureMap, reqUsed: requestsUsed, matched, unmatched };
}
