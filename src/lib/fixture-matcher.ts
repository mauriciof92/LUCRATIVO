// src/lib/fixture-matcher.ts
// Fuzzy matching robusto entre nomes do CSV e API-Football
// Reduz 1461 requests → ~21 requests

// ─────────────────────────────────────────────────────────────
// 1. NORMALIZAÇÃO DE NOMES
// ─────────────────────────────────────────────────────────────

const ABBREVIATIONS: Record<string, string> = {
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'spurs': 'tottenham',
  'tottenham hotspur': 'tottenham',
  'barca': 'barcelona',
  'atletico': 'atletico madrid',
  'atlético': 'atletico madrid',
  'inter': 'inter milan',
  'psv': 'psv eindhoven',
  'ajax': 'afc ajax',
  'rb leipzig': 'rasenballsport leipzig',
  'wolves': 'wolverhampton',
  'newcastle': 'newcastle united',
  'west ham': 'west ham united',
  'brighton': 'brighton hove albion',
  
  // ── NOVOS — casos identificados em produção ──
  'sporting braga': 'sc braga',
  'braga': 'sc braga',
  'vitoria guimaraes': 'vitoria sc',
  'vitória guimarães': 'vitoria sc',
  'vitoria sc': 'vitoria sc',
  'queens park rangers': 'qpr',
  'qpr': 'queens park rangers',  // bidirecional
  'hearts': 'heart of midlothian',
  'heart of midlothian': 'hearts',
  'internacional de bogota': 'internacional bogota',
  'internacional de bogotá': 'internacional bogota',
};

export function normalizeTeamName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ABBREVIATIONS[cleaned] ?? cleaned;
}

// ─────────────────────────────────────────────────────────────
// 2. ALGORITMO DE SIMILARIDADE — TRIGRAM + JACCARD
// ─────────────────────────────────────────────────────────────

function getTrigrams(str: string): Set<string> {
  const padded = `  ${str}  `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set(Array.from(a).filter(x => b.has(x)));
  const union = new Set([...Array.from(a), ...Array.from(b)]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Similaridade por tokens (palavras individuais)
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(b.split(' ').filter(t => t.length > 1));
  const intersection = Array.from(tokensA).filter(t => tokensB.has(t)).length;
  const union = new Set([...Array.from(tokensA), ...Array.from(tokensB)]).size;
  return union === 0 ? 0 : intersection / union;
}

// Score combinado: trigram + token + bônus prefixo
export function teamSimilarity(csvName: string, apiName: string): number {
  const a = normalizeTeamName(csvName);
  const b = normalizeTeamName(apiName);

  // Match exato
  if (a === b) return 1.0;

  // Um contém o outro (ex: "Arsenal" em "Arsenal FC")
  if (a.includes(b) || b.includes(a)) return 0.92;

  const trigramScore = jaccardSimilarity(getTrigrams(a), getTrigrams(b));
  const tokenScore   = tokenSimilarity(a, b);

  // Bônus se começam com a mesma palavra
  const firstWordA = a.split(' ')[0];
  const firstWordB = b.split(' ')[0];
  const prefixBonus = firstWordA === firstWordB && firstWordA.length > 3 ? 0.1 : 0;

  return Math.min(1, trigramScore * 0.5 + tokenScore * 0.4 + prefixBonus);
}

// ─────────────────────────────────────────────────────────────
// 3. MATCHER DE FIXTURE
// ─────────────────────────────────────────────────────────────

export interface CsvMatch {
  home: string;   // "Manchester City"
  away: string;   // "Newcastle United"
  hour: string;
  league: string;
}

export interface ApiFixture {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
}

export interface MatchResult {
  csvMatch: CsvMatch;
  fixtureId: number;
  confidence: number;       // 0-1
  homeScore: number;
  awayScore: number;
  apiHomeTeam: string;
  apiAwayTeam: string;
}

export function matchFixtures(
  csvMatches: CsvMatch[],
  apiFixtures: ApiFixture[],
  minConfidence = 0.65  // 🆕 Fix 3: Elevado threshold de 0.55 para 0.65
): { matched: MatchResult[]; unmatched: CsvMatch[] } {
  const matched: MatchResult[] = [];
  const unmatched: CsvMatch[] = [];
  
  // 🆕 Fix 2: Rastrear fixtures já atribuídos para evitar colisão
  const usedFixtures = new Set<number>();

  for (const csvMatch of csvMatches) {
    let bestScore = 0;
    let bestFixture: ApiFixture | null = null;
    let bestHomeScore = 0;
    let bestAwayScore = 0;

    for (const fixture of apiFixtures) {
      // Tentar ordem direta: CSV home↔API home, CSV away↔API away
      const directHome = teamSimilarity(csvMatch.home, fixture.homeTeam);
      const directAway = teamSimilarity(csvMatch.away, fixture.awayTeam);
      const directScore = (directHome + directAway) / 2;

      // Tentar ordem invertida (às vezes a API inverte)
      const invertHome = teamSimilarity(csvMatch.home, fixture.awayTeam);
      const invertAway = teamSimilarity(csvMatch.away, fixture.homeTeam);
      const invertScore = (invertHome + invertAway) / 2;

      const score = Math.max(directScore, invertScore);

      if (score > bestScore) {
        bestScore = score;
        bestFixture = fixture;
        bestHomeScore = directScore >= invertScore ? directHome : invertHome;
        bestAwayScore = directScore >= invertScore ? directAway : invertAway;
      }
    }

    if (bestFixture && bestScore >= minConfidence && !usedFixtures.has(bestFixture.fixtureId)) {
      // Fix 2: Verificar se fixture já foi usado
      usedFixtures.add(bestFixture.fixtureId);
      matched.push({
        csvMatch,
        fixtureId: bestFixture.fixtureId,
        confidence: bestScore,
        homeScore: bestHomeScore,
        awayScore: bestAwayScore,
        apiHomeTeam: bestFixture.homeTeam,
        apiAwayTeam: bestFixture.awayTeam,
      });
    } else {
      // Log borderline para diagnóstico (ajustado para novo threshold)
      if (bestScore >= 0.45 && bestScore < minConfidence && bestFixture) {
        console.info(`[Matcher] Borderline: CSV="${csvMatch.home} x ${csvMatch.away}" | Candidato="${bestFixture.homeTeam} x ${bestFixture.awayTeam}" | Score=${(bestScore*100).toFixed(0)}%`);
      }
      
      // Fix 2: Log de fixture já usado
      if (bestFixture && usedFixtures.has(bestFixture.fixtureId)) {
        console.warn(`[Matcher] Fixture colisão: ID ${bestFixture.fixtureId} já atribuído a outro jogo - ignorando ${csvMatch.home} x ${csvMatch.away}`);
      }
      
      // Log para diagnóstico
      console.warn(`[Matcher] Sem match para: ${csvMatch.home} x ${csvMatch.away}`,
        bestFixture
          ? `Melhor candidato: ${bestFixture.homeTeam} x ${bestFixture.awayTeam} (${(bestScore*100).toFixed(0)}%)` 
          : 'Nenhum candidato'
      );
      unmatched.push(csvMatch);
    }
  }

  return { matched, unmatched };
}

// ─────────────────────────────────────────────────────────────
// 4. FLUXO OTIMIZADO — 21 REQUESTS NO TOTAL
// ─────────────────────────────────────────────────────────────

export async function fetchOddsForCsvMatches(
  csvMatches: CsvMatch[],
  apiKey: string,
  date: string  // formato: "2026-02-21"
): Promise<{
  odds: Record<number, any>;           // fixtureId → odds
  matched: MatchResult[];
  unmatched: CsvMatch[];
  requestsUsed: number;
}> {
  let requestsUsed = 0;

  // ── REQUEST 1: Todos os fixtures do dia (1 request) ──────────
  console.log(`[Matcher] Buscando fixtures de ${date}...`);
  const fixturesRes = await fetch(
    `https://v3.football.api-sports.io/fixtures?date=${date}`,
    { headers: { 'x-apisports-key': apiKey } }
  );
  requestsUsed++;

  if (!fixturesRes.ok) {
    throw new Error(`[Matcher] Erro ao buscar fixtures: ${fixturesRes.status}`);
  }

  const fixturesData = await fixturesRes.json();
  const apiFixtures: ApiFixture[] = (fixturesData.response ?? []).map((f: any) => ({
    fixtureId: f.fixture.id,
    homeTeam:  f.teams.home.name,
    awayTeam:  f.teams.away.name,
    league:    f.league.name,
    date:      f.fixture.date,
  }));

  console.log(`[Matcher] ${apiFixtures.length} fixtures encontrados na API`);
  console.log(`[Matcher] ${csvMatches.length} jogos no CSV para mapear`);

  // ── FUZZY MATCHING ──────────────────────────────────────────
  const { matched, unmatched } = matchFixtures(csvMatches, apiFixtures);
  console.log(`[Matcher] ✅ ${matched.length} mapeados | ❌ ${unmatched.length} sem match`);

  // Log de qualidade do matching
  const avgConfidence = matched.length > 0
    ? matched.reduce((a, m) => a + m.confidence, 0) / matched.length
    : 0;
  console.log(`[Matcher] Confiança média do matching: ${(avgConfidence*100).toFixed(1)}%`);

  // ── REQUESTS 2..N: Odds apenas dos fixtures mapeados ────────
  const odds: Record<number, any> = {};
  const fixtureIds = matched.map(m => m.fixtureId);

  // Buscar em lotes de 10 para não sobrecarregar
  const BATCH_SIZE = 10;
  for (let i = 0; i < fixtureIds.length; i += BATCH_SIZE) {
    const batch = fixtureIds.slice(i, i + BATCH_SIZE);

    // API-Football permite múltiplos IDs com vírgula? Não nativamente.
    // Usar Promise.all para paralelizar (cuidado com rate limit)
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const res = await fetch(
          `https://v3.football.api-sports.io/odds?fixture=${id}&bookmaker=8`,
          // bookmaker 8 = Bet365, ajustar conforme necessário
          { headers: { 'x-apisports-key': apiKey } }
        );
        requestsUsed++;
        if (!res.ok) return { id, data: null };
        const data = await res.json();
        return { id, data: data.response?.[0] ?? null };
      })
    );

    batchResults.forEach(({ id, data }) => {
      if (data) odds[id] = data;
    });

    // Pequena pausa entre batches para respeitar rate limit
    if (i + BATCH_SIZE < fixtureIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[Matcher] Total de requests usados: ${requestsUsed}`);
  console.log(`[Matcher] Odds encontradas para ${Object.keys(odds).length} fixtures`);

  return { odds, matched, unmatched, requestsUsed };
}

// ─────────────────────────────────────────────────────────────
// 5. EXTRATOR DE ODD ESPECÍFICA
// ─────────────────────────────────────────────────────────────

export function extractOdd(
  fixtureOdds: any,
  marketName: string,    // ex: "Goals Over/Under"
  betValue: string       // ex: "Over 1.5"
): number | null {
  if (!fixtureOdds?.bookmakers) return null;

  for (const bookmaker of fixtureOdds.bookmakers) {
    for (const bet of (bookmaker.bets ?? [])) {
      if (bet.name.toLowerCase().includes(marketName.toLowerCase())) {
        const value = bet.values?.find((v: any) =>
          v.value.toLowerCase().includes(betValue.toLowerCase())
        );
        if (value) return parseFloat(value.odd);
      }
    }
  }
  return null;
}
