/* ─────────────────────────────────────────
   CSV / XLSX PARSER
   ÍNDICES EXCEL RENOMEADO (PackBall .xlsx)
   [5]  Home Team      [8]  Visitor Team
   [13] Média gols H|A (pipe — soma = xG preciso)
   [16] Média escanteios FT H|A
   [18] Média escanteios HT H|A
   [25] CV gols H|A    (pipe → média)
   [27] ExG global     (escalar arredondado)
   [30] ExC global     (escalar)
   [38] Chutes no gol HT H|A
   [39] Total chutes HT H|A
   [41] AF força de ataque H|A
   [44] % Over 0.5 gols HT H|A
───────────────────────────────────────── */
import { CSV_MAPPER } from './lib/csv-helper';

function stripQ(s) { return (s || "").trim().replace(/^"+|"+$/g, ""); }
function toNum(raw) {
  const s = stripQ(String(raw ?? "")).replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function toPipe(raw) {
  const s = stripQ(raw ?? "");
  const [a, b] = s.split("|");
  return { h: toNum(a), a: toNum(b ?? null) };
}
function pipeAvg(raw) {
  const { h, a } = toPipe(raw);
  if (h === null && a === null) return null;
  if (h === null) return a;
  if (a === null) return h;
  return (h + a) / 2;
}

function normKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOdds(rowValues) {
  const names = [
    "Odds Mais de 2.5 gols FT",
    "Odds Casa para vencer",
    "Odds Visitante para vencer",
    "Odds Ambas marcarem (Sim)",
    "Odds Mais de 0.5 gols 1T",
    "Odds Mais de 8.5 escanteios FT",
    "Odds Mais de 1.5 gols FT",    // ← ADICIONAR - Reforma Odds
    "Odds Under 2.5 gols FT",      // ← ADICIONAR - Reforma Odds
  ];
  const odds = {};
  for (let i = 0; i < names.length; i++) {
    const n = toNum(rowValues[9 + i]);
    if (n !== null) odds[names[i]] = n;
  }
  return odds;
}

function buildEngineIndex(headers) {
  const find = (patterns, fallbackIdx) => {
    for (const p of patterns) {
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (p.test(h)) return i;
      }
    }
    return fallbackIdx;
  };

  return {
    country:     find([/^country\b/], 0),
    short:       find([/^short\b/], 1),
    league:      find([/^league\b/], 2),
    hour:        find([/^hour\b/, /\bdata\b.*\bhora\b/, /\bdate\b.*\btime\b/], 3),
    status:      find([/^status\b/], 4),

    home:        find([/^home team\b/, /\bcasa\b.*\btime\b/, /\bmandante\b/], 5),
    away:        find([/^visitor team\b/, /\bvisit(or|ante)\b.*\bteam\b/, /\bfora\b.*\btime\b/, /\bvisitante\b/], 8),
    resHome:     find([/^result home\b/, /\bresultado\b.*\bcasa\b/, /\bplacar\b.*\bcasa\b/, /\bgols?\b.*\bcasa\b/, /\bscore\b.*\bhome\b/], 6),
    resAway:     find([/^result visitor\b/, /\bresultado\b.*\bvisit/, /\bplacar\b.*\bvisit/, /\bgols?\b.*\bvisit/, /\bscore\b.*\bvisit/], 7),
    resScore:    find([/^result$/, /^resultado$/, /^placar$/, /^score$/, /^ft\b.*\bresult/, /^resultado\b.*\bfinal/], -1),

    // ExG / ExC — colunas Global
    exG:         find([
      /\bexg\b.*\bexpectativa\b.*\bgols\b/,
      /\bexpectativa\b.*\bgols\b.*\bmedia\s*final\b/,
      /\bglobal\b.*\bexg\b/,
    ], 25),  // CORRIGIDO: coluna 25 (exG)
    exC:         find([
      /\bexc\b.*\bexpectativa\b.*\bescanteios\b/,
      /\bexpectativas?\b.*\bescanteios\b/,
      /\bglobal\b.*\bexc\b/,
    ], 26),  // CORRIGIDO: coluna 26 (exC)

    // CV gols (FT, excluir HT e cantos)
    cv:          find([
      /\bcoeficiente\b.*\bvariacao\b.*\bgols\b(?!.*(?:1.*tempo|ht|cant))/,
      /\bcv\b.*\bcoeficiente\b.*\bvariacao\b.*\bgols\b(?!.*(?:1.*tempo|ht|cant))/,
    ], 23), // CORRIGIDO: índice 23 (era 25)

    // AF força de ataque
    af:          find([
      /\[35\]\s*casa\s*\|\s*fora/i,  // Mapeamento direto para coluna 35
      /\baf\b.*\bforca\b.*\bataque\b/,
      /\bforca\b.*\bataque\b(?!.*defesa)/,
    ], 35),

    // Classificação (novo campo)
    classificacao: find([
      /\bclassificacao\b/,
      /\bclassificação\b/,
    ], 36),

    // Pontos por jogo (novo campo)
    pontosPorJogo: find([
      /\bpontos\b.*\bjogo\b/,
      /\bppg\b/,
    ], 33), // CORRIGIDO: índice 33 (era 37)

    // Média gols marcados Casa-Fora (excluir HT e sofridos)
    golsAvgHA:   find([
      /\bmedia\b.*\bgols\b.*\bmarcados\b(?!.*(?:1.*tempo|ht|sofrido))/,
      /\bmedia\b.*\bgols\b.*\bmarcados\b.*\bcasa.?fora\b/,
    ], 15), // CORRIGIDO: índice 15 (era 17)

    // Média escanteios marcados FT (excluir HT e minutos)
    cantFTFor:   find([
      /\bmedia\b.*\bescanteios\b.*\bmarcados\b(?!.*(?:1.*tempo|ht|\d+-\d+))/,
      /\bmedia\b.*\bescanteios\b.*\bmarcados\b.*\bcasa.?fora\b(?!.*ht)/,
    ], 17), // CORRIGIDO: índice 17 (era 19)

    // Média escanteios marcados HT (1° tempo, excluir minutos)
    cantHTFor:   find([
      /\bmedia\b.*\bescanteios\b.*\bmarcados\b.*1.?\s*tempo(?!.*\d+-\d+)/,
      /\bht\b.*\bmedia\b.*\bescanteios\b.*\bmarcados\b/,
    ], 19), // CORRIGIDO: índice 19 (era 31)

    // Chutes marcados (no gol) HT
    shotsOnHT:   find([
      /\btotal\b.*\bchutes\b.*\bmarcados\b.*(?:1.*tempo|ht)/,
      /\bchutes\b.*\bno\s*gol\b.*(?:1.*tempo|ht)/,
      /\bmedia\b.*\bchutes\b.*\bmarcados\b.*(?:1.*tempo|ht)/,
    ], 31), // CORRIGIDO: índice 31 (era 34)

    // Total chutes HT (sem "marcados" nem "sofridos")
    shotsTotHT:  find([
      /\btotal\b.*\bchutes\b.*(?:1.*tempo|ht)(?!.*(?:marcad|sofrid))/,
      /\bmedia\b.*\btotal\b.*\bchutes\b.*(?:1.*tempo|ht)(?!.*(?:marcad|sofrid))/,
    ], 42), // CORRIGIDO: índice 42 (era 46)

    // % Mais de 0.5 gols 1° tempo
    gol05HT:     find([
      /\bmais\b.*\b0[,.]?5\b.*\bgols\b.*(?:1.*tempo|ht)/,
      /\bover\s*0[.,]?5\b.*(?:1.*tempo|ht)/,
    ], 34), // CORRIGIDO: índice 34 (era 38)

    // ── NOVOS CAMPOS ──
    // Média gols sofridos
    golsSofridos: find([
      /\bmedia\b.*\bgols\b.*\bsofridos\b(?!.*(?:1.*tempo|ht))/,
    ], 30), // CORRIGIDO: índice 30 (era mapeado como escanteios31a40 - ERRADO)

    // DF força de defesa
    dfDefesa:    find([
      /\bforca\b.*\bdefesa\b/,
      /\bdf\b.*\bforca\b.*\bdefesa\b/,
    ], 43), // CORRIGIDO: índice 43 (era 45)
    
    // Média chutes sofridos HT
    mediaChutesSofridosHT: find([
      /\bmedia\s*total\s*chutes\s*sofridos\s*1.*tempo\b/,
      /\bmédia\s*total\s*chutes\s*sofridos\s*1.*tempo\b/,
    ], 41), // CORRIGIDO: índice 41 (era 45)
    
    // % AF Força de ataque
    afPercent:    find([
      /%\s*af\s*forca\s*de\s*ataque/,
      /%\s*forca\s*de\s*ataque/,
    ], 32), // CORRIGIDO: índice 32 (era 47)

    // Favoritismo
    favoritismo: find([
      /\bfavoritismo\b/,
      /\bfav\b.*\bmedia\b.*\bfinal\b/,
    ], 44), // CORRIGIDO: índice 44 (era 48)

    // Gols marcados HT
    golsHTMarcados: find([
      /\bmedia\b.*\bgols\b.*\bmarcados\b.*(?:1.*tempo|ht)/,
    ], 35), // CORRIGIDO: índice 35 (era 39)

    // Gols sofridos HT
    golsHTSofridos: find([
      /\bmedia\b.*\bgols\b.*\bsofridos\b.*(?:1.*tempo|ht)/,
    ], 36), // CORRIGIDO: índice 36 (era 40)

    // % Ambas marcaram
    btsPercent: find([
      /\bambas\b.*\bmarcaram\b/,
      /\bbts\b/,
    ], 37), // CORRIGIDO: índice 37 (era 41)

    // 📊 COLUNAS ADICIONAIS DO PACKBALL (33 colunas faltantes)
    
    // Estatísticas de Gols Adicionais
    percMais25Gols: find([
      /%\s*mais\s*de\s*2\.5\s*gols/,
      /\bpercent\s*mais\s*2\.5\s*gols\b/,
    ], 16), // CORRIGIDO: índice 16 (era 18)
    
    percMediaGolsMarcadosHT: find([
      /%\s*media\s*gols\s*marcados\s*1.*tempo/,
      /%\s*média\s*gols\s*marcados\s*1.*tempo/,
    ], 39),
    
    // Estatísticas de Cantos Detalhadas
    mediaEscanteiosMarcados: find([
      /\bmedia\b.*\bescanteios\b.*\bmarcados\b/,
      /\bmédia\b.*\bescanteios\b.*\bmarcados\b/,
    ], 17), // CORRIGIDO: índice 17 (era 19)
    
    mediaEscanteiosSofridos: find([
      /\bmedia\b.*\bescanteios\b.*\bsofridos\b/,
      /\bmédia\b.*\bescanteios\b.*\bsofridos\b/,
    ], 18), // CORRIGIDO: índice 18 (era 20)
    
    mediaEscanteiosSofridosHT: find([
      /\bmedia\b.*\bescanteios\b.*\bsofridos\b.*\b1.*tempo\b/,
      /\bmédia\b.*\bescanteios\b.*\bsofridos\b.*\b1.*tempo\b/,
    ], 20), // CORRIGIDO: índice 20 (era 22)
    
    percMais4EscanteiosHT: find([
      /%\s*mais\s*de\s*4\s*escanteios\s*1.*tempo/,
      /\bpercent\s*mais\s*4\s*escanteios\s*1.*tempo\b/,
    ], 21), // CORRIGIDO: índice 21 (era 23)
    
    percMais5EscanteiosHT: find([
      /%\s*mais\s*de\s*5\s*escanteios\s*1.*tempo/,
      /\bpercent\s*mais\s*5\s*escanteios\s*1.*tempo\b/,
    ], 22), // CORRIGIDO: índice 22 (era 24)
    
    mediaEscanteios0a10: find([
      /\bmedia\s*escanteios\s*marcados\s*0-10\b/,
      /\bmédia\s*escanteios\s*marcados\s*0-10\b/,
    ], 39), // CORRIGIDO: índice 39 (era 43)
    
    mediaEscanteios11a20: find([
      /\bmedia\s*escanteios\s*marcados\s*11-20\b/,
      /\bmédia\s*escanteios\s*marcados\s*11-20\b/,
    ], 40), // CORRIGIDO: índice 40 (era 44)
    
    mediaEscanteios21a30: find([
      /\bmedia\s*escanteios\s*marcados\s*21-30\b/,
      /\bmédia\s*escanteios\s*marcados\s*21-30\b/,
    ], 29), // CORRIGIDO: índice 29 (era 31)
    
    // Média escanteios marcados 31-40'
    mediaEscanteios31a40: find([
      /\bmedia\s*escanteios\s*marcados\s*31-40\b/,
      /\bmédia\s*escanteios\s*marcados\s*31-40\b/,
    ], 30), // CORRIGIDO: índice 30 (era 32) - CONFLITO RESOLVIDO
    
    // % Primeiro a cobrar 5 escanteios
    percPrimeiro5Escanteios: find([
      /%\s*primeiro\s*a\s*cobrar\s*5\s*escanteios/,
      /\bpercent\s*primeiro\s*5\s*escanteios\b/,
    ], 38), // CORRIGIDO: índice 38 (era 42)
    
    // Estatísticas de Chutes Detalhadas
    // (mediaChutesSofridosHT já mapeado acima)
    
    // Média total chutes HT
    mediaTotalChutesHT: find([
      /\bmedia\s*total\s*chutes\s*1.*tempo\b/,
      /\bmédia\s*total\s*chutes\s*1.*tempo\b/,
    ], 42), // CORRIGIDO: índice 42 (era 46)
    
    // Estatísticas de Variação
    cvGolsHT: find([
      /\bcoeficiente\b.*\bvariacao\b.*\bgols\b.*\b1.*tempo\b/,
      /\bcv\b.*\bcoeficiente\b.*\bvariacao\b.*\bgols\b.*\b1.*tempo\b/,
    ], 24), // CORRIGIDO: índice 24 (era 26)
    
    cvCantosHT: find([
      /\bcoeficiente\b.*\bvariacao\b.*\bcantos\b.*\b1.*tempo\b/,
      /\bcv\b.*\bcoeficiente\b.*\bvariacao\b.*\bcantos\b.*\b1.*tempo\b/,
    ], 27), // CORRIGIDO: índice 27 (era 29)
    
    // 🆕 CAMPOS ADICIONAIS CRÍTICOS
    cantos_37_ht: find([
      /\bmédia\s*escanteios\s*marcados\s*37-ht/i,
      /\bcantos\s*37\s*ht/i,
    ], 45), // NOVO: índice 45 para cantos 37-HT
    
    as_precisao: find([
      /%\s*precisão\s*nos\s*chutes/i,
      /%\s*precisao\s*nos\s*chutes/i,
      /as\s*%\s*precisão/i,
      /as\s*%\s*precisao/i,
    ], 46), // NOVO: índice 46 para AS % Precisão
    
    appg: find([
      /avg\s*-\s*média\s*de\s*ataques\s*perigosos/i,
      /média\s*de\s*ataques\s*perigosos/i,
      /avg\s*ataques\s*perigosos/i,
      /appg/i,
    ], 47), // NOVO: índice 47 para AVG ataques perigosos
  };
}

export function getOddForLabel(g, label) {
  const odds = g?.odds;
  if (!odds || typeof odds !== "object") return null;

  const raw = String(label ?? "");
  if (raw.includes("+")) {
    const parts = raw.split("+").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let prod = 1;
      for (const p of parts) {
        const o = getOddForLabel(g, p);
        if (typeof o !== "number" || isNaN(o) || o <= 1) return null;
        prod *= o;
      }
      return prod;
    }
  }

  const nl = normKey(raw);
  if (!nl) return null;

  // Mercados sem coluna de odd no CSV Packball — retornar null imediatamente
  // O CSV só tem odds para: Over 2.5 FT, Casa, Visitante, BTTS, Over 0.5 HT, Over 8.5 cantos FT
  if (nl.includes("finalizac") || nl.includes("chute")) return null;
  if ((nl.includes("canto") || nl.includes("escanteio")) && nl.includes("ht")) return null;
  if ((nl.includes("canto") || nl.includes("escanteio")) && (nl.includes("over 3.5") || nl.includes("over 4.5") || nl.includes("over 5.5") || nl.includes("over 6.5") || nl.includes("over 7.5") || nl.includes("over 9.5"))) return null;
  
  // 🆕 BLOQUEAR Over 1.5/2.5 FT do CSV - apenas API real permitida
  if (nl.includes("over 1.5") || nl.includes("over 2.5")) return null;

  const wantTokens = [];
  if (nl.includes("over 0.5") && nl.includes("ht")) wantTokens.push("mais de 0.5 gols 1° tempo");
  // 🆕 Over 1.5/2.5 FT removidos - apenas API real permitida
  else if (nl.includes("ambas marcam")) wantTokens.push("ambas as equipes marcarem (sim)");
  else if (nl.includes("cantos") && nl.includes("ht")) wantTokens.push("mais de 4 escanteios 1° tempo");
  else if (nl.includes("cantos")) wantTokens.push("mais de 8.5 escanteios");
  else if (nl.includes("vence")) {
    const isAway = raw.includes('✈️') || nl.includes('fora');
    if (isAway) {
      wantTokens.push("visitante para vencer");
    } else {
      wantTokens.push("casa para vencer");
    }
  }

  const entries = Object.entries(odds);
  if (entries.length === 0) return null;

  let best = null;
  let bestScore = -1;
  for (const [k, v] of entries) {
    const nk = normKey(k);
    if (!nk) continue;
    let s = 0;
    if (/(^|\b)(odd|odds|cota|cotacao)(\b|$)/.test(nk)) s += 1;
    for (const t of wantTokens) if (nk.includes(t)) s += 3;
    // FALLBACK SEGURO: só para os 6 mercados reais (Over 1.5/2.5 removidos)
    if (wantTokens.length === 0 && nl && nk.includes(nl)) {
      // Verificar se é um dos 6 mercados permitidos
      const allowedMarkets = [
        "ambas as equipes marcarem (sim)",
        "mais de 0.5 gols 1° tempo",
        "mais de 8.5 escanteios",
        "mais de 4 escanteios 1° tempo",
        "casa para vencer",
        "visitante para vencer"
      ];
      if (allowedMarkets.some(market => nk.includes(market))) {
        s += 2; // Permitir fallback apenas para mercados reais
      }
    }
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore > 0 ? best : null;
}

export function getMinOddForLabel(label) {
  const nl = normKey(label);
  if (!nl) return null;

  // Defaults are conservative and can be tuned later
  if (nl.includes("over 1.5")) return 1.22;
  if (nl.includes("over 2.5")) return 1.55;
  if (nl.includes("under 2.5")) return 1.70; // Aumentado de 1.55 (mais seletivo)
  if (nl.includes("ambas marcam")) return 1.60;

  if (nl.includes("over 0.5") && nl.includes("ht")) return 1.35;

  if (nl.includes("cantos") || nl.includes("escanteios")) {
    if (nl.includes("over 9.5")) return 1.75; // Aumentado de 1.70
    if (nl.includes("over 8.5")) return 1.70; // Aumentado de 1.65
    if (nl.includes("ht")) {
      if (nl.includes("over 3.5")) return 1.85; // Aumentado de 1.75
      if (nl.includes("over 2.5")) return 1.80; // Aumentado de 1.75
      return 1.80; // Base HT mais alto
    }
    return 1.70; // Aumentado de 1.65
  }

  if (nl.includes("finalizacoes") || nl.includes("chutes")) return 1.70;
  if (nl.includes("vence")) return 1.55;

  // Fallback genérico para não barrar seleções por falta de odd estimada
  return 1.40;
}

// Gera ID único e determinístico por jogo (hash simples, sem colisão entre imports)
function generateGameId(home, away, league, hour) {
  const datePart = extractDateFromHour(hour);
  const raw = `${(home || '').toLowerCase().trim()}_${(away || '').toLowerCase().trim()}_${(league || '').toLowerCase().trim()}_${datePart}`;
  // Hash simples: djb2
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36); // base36 = compacto e legível
}

// Extrai parte de data do campo hour do CSV
// "25/02 15:00" → "2502" | "25/02/2026 15:00" → "2502" | "15:00" → data atual
export function extractDateFromHour(hour) {
  const h = String(hour || '').trim();
  // DD/MM ou DD/MM/YYYY
  const m = h.match(/^(\d{2})\/(\d{2})/);
  if (m) return m[1] + m[2]; // "2502"
  // ISO: YYYY-MM-DD
  const iso = h.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + iso[2]; // "2502"
  // Sem data → usar data atual do sistema
  const now = new Date();
  return String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0');
}

export function parseCSV(text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const rawLines = clean.trim().split(/\r?\n/);

  // Merge linhas que pertencem a campos quoted com newline interno
  const lines = [];
  let buf = '';
  let open = false;
  for (const line of rawLines) {
    if (open) {
      buf += ' ' + line;
    } else {
      if (buf) lines.push(buf);
      buf = line;
    }
    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 !== 0) open = !open;
  }
  if (buf) lines.push(buf);

  if (lines.length < 2) return { games: [], dbg: null };
  const cSemi = (lines[0].match(/;/g) || []).length;
  const cComma = (lines[0].match(/,/g) || []).length;
  const cTab = (lines[0].match(/\t/g) || []).length;
  const sep = cTab >= cSemi && cTab >= cComma ? "\t" : (cSemi >= cComma ? ";" : ",");

  const idx = CSV_MAPPER;

  // Ignora a primeira linha se for o cabeçalho do Packball (col5 = 'Home Team')
  const rows = lines.filter(l => {
    if (!l.trim()) return false;
    const first = l.split(sep)[5]?.replace(/"/g, '').trim();
    return first !== 'Home Team';
  });

  // Helper: parse placar de coluna única ("2-1", "2x1", "2:1")
  function parseScore(raw) {
    const s = stripQ(String(raw ?? ""));
    const m = s.match(/^(\d+)\s*[-x:]\s*(\d+)$/i);
    if (m) return { h: parseInt(m[1]), a: parseInt(m[2]) };
    return { h: null, a: null };
  }

  console.log(`📋 [parseCSV] ${rows.length} linhas de dados | sep='${sep}' | exG=[${idx.exG}] af=[${idx.af}] fav=[${idx.favoritismo}]`);

  const games = rows.map((r, i) => {
    const v = r.split(sep).map(stripQ);
    if (v.length < 9) return null; // linha malformada ou cabeçalho residual
    
    const exGraw  = toNum(v[idx.exG]);

    const golHA = toPipe(v[idx.golsAvgHA]);
    const exGsum  = (golHA.h !== null && golHA.a !== null) ? golHA.h + golHA.a : exGraw;

    const exC     = toNum(v[idx.exC]);
    const cvRaw   = pipeAvg(v[idx.cv]);

    const afPipe  = toPipe(v[idx.af]);
    const afH     = afPipe.h;
    const afA     = afPipe.a;

    const chGolHT = toPipe(v[idx.shotsOnHT]);
    const chTotHT = toPipe(v[idx.shotsTotHT]);

    const cantHT  = toPipe(v[idx.cantHTFor]);
    const cantFT  = toPipe(v[idx.cantFTFor]);

    const gol05HT = toPipe(v[idx.gol05HT]);

    // Novos campos
    const golsSof  = toPipe(v[idx.golsSofridos]);
    const dfPipe   = toPipe(v[idx.dfDefesa]);
    const favRaw   = toNum(v[idx.favoritismo]);
    const golsHTM  = toPipe(v[idx.golsHTMarcados]);
    const golsHTS  = toPipe(v[idx.golsHTSofridos]);
    const btsPct   = toPipe(v[idx.btsPercent]);
    
    // Campos adicionais
    const classPipe  = toPipe(v[idx.classificacao]);
    const pontosPipe = toPipe(v[idx.pontosPorJogo]);
    const cantos37HT = toPipe(v[idx.cantos_37_ht]); // 🆕 Campo novo: cantos 37-HT
    const asPrecisao = toPipe(v[idx.as_precisao]); // 🆕 Campo novo: AS % Precisão (corrigido)
    const appgPipe   = toPipe(v[idx.appg]); // 🆕 Campo novo: AVG ataques perigosos

    const odds = extractOdds(v);

    // Resultado: tentar colunas separadas primeiro, depois coluna única
    let rH = toNum(v[idx.resHome]);
    let rA = toNum(v[idx.resAway]);
    if (rH === null && rA === null && idx.resScore >= 0) {
      const sc = parseScore(v[idx.resScore]);
      rH = sc.h;
      rA = sc.a;
    }

    const _home = stripQ(v[idx.home]);
    const _away = stripQ(v[idx.away]);
    const _league = stripQ(v[idx.league]);
    const _hour = stripQ(v[idx.hour]);
    const _status = stripQ(v[idx.status]);

    return {
      id:      generateGameId(_home, _away, _league, _hour),
      home:    _home,
      away:    _away,
      match:   `${_home} x ${_away}`,
      league:  _league,
      hour:    _hour,
      status:  _status,
      resultHome: rH,
      resultAway: rA,
      exG:     exGsum  ?? exGraw ?? 0,
      exGraw:  exGraw  ?? 0,
      exC:     exC     ?? 0,
      cv:      cvRaw   ?? 0,
      afH:     afH     ?? 0,
      afA:     afA     ?? 0,
      chHTH:   chGolHT.h ?? 0,
      chHTA:   chGolHT.a ?? 0,
      chTotH:  chTotHT.h ?? 0,
      chTotA:  chTotHT.a ?? 0,
      cantHTH: cantHT.h  ?? 0,
      cantHTA: cantHT.a  ?? 0,
      cantFTH: cantFT.h  ?? 0,
      cantFTA: cantFT.a  ?? 0,
      gol05HTH: gol05HT.h ?? 0,
      gol05HTA: gol05HT.a ?? 0,
      // Novos campos
      golsSofH:  golsSof.h ?? 0,
      golsSofA:  golsSof.a ?? 0,
      dfH:       dfPipe.h  ?? 0,
      dfA:       dfPipe.a  ?? 0,
      favoritismo: favRaw  ?? 0,
      golsHTH:   golsHTM.h ?? 0,
      golsHTA:   golsHTM.a ?? 0,
      golsHTSofH: golsHTS.h ?? 0,
      golsHTSofA: golsHTS.a ?? 0,
      btsPctH:   btsPct.h  ?? 0,
      btsPctA:   btsPct.a  ?? 0,
      // Campos adicionais
      classH:    classPipe.h ?? 0,
      classA:    classPipe.a ?? 0,
      ppgH:        pontosPipe.h ?? 0,
      ppgA:        pontosPipe.a ?? 0,
      cantos37HTH:  cantos37HT.h ?? 0,  // 🆕 Novo campo: cantos 37-HT
      cantos37HTA:  cantos37HT.a ?? 0,  // 🆕 Novo campo: cantos 37-HT
      asPrecisaoH:  asPrecisao.h ?? 0,   // 🆕 Novo campo: AS % Precisão
      asPrecisaoA:  asPrecisao.a ?? 0,   // 🆕 Novo campo: AS % Precisão
      appgH:        appgPipe.h   ?? 0,   // 🆕 Novo campo: AVG ataques perigosos
      appgA:        appgPipe.a   ?? 0,   // 🆕 Novo campo: AVG ataques perigosos
      // Adicionar objeto AF para getFavorito
      af:          { h: afH, a: afA },
      odds,
      _miss: {
        exG: exGraw === null,
        exC: exC   === null,
        cv:  cvRaw === null,
        af:  afH   === null || afA === null,
        classificacao: classPipe.h === null || classPipe.a === null,
        pontosPorJogo: pontosPipe.h === null || pontosPipe.a === null,
      },
    };
  });

  const validGames = games.filter(g => g !== null);
  const ok = validGames.filter(g => !g._miss.exG);
  const flatShotMarkHT = validGames.flatMap(g => [g.chHTH, g.chHTA]).filter(n => typeof n === "number" && !isNaN(n));
  const flatShotTotHT  = validGames.flatMap(g => [g.chTotH, g.chTotA]).filter(n => typeof n === "number" && !isNaN(n));
  const dbg = {
    sep, cols: rows.length,
    exGRange: ok.length ? `${Math.min(...ok.map(g => g.exG)).toFixed(1)} – ${Math.max(...ok.map(g => g.exG)).toFixed(1)}` : "—",
    exCRange: ok.length ? `${Math.min(...ok.map(g => g.exC)).toFixed(1)} – ${Math.max(...ok.map(g => g.exC)).toFixed(1)}` : "—",
    cvRange:  ok.length ? `${Math.min(...ok.map(g => g.cv)).toFixed(0)} – ${Math.max(...ok.map(g => g.cv)).toFixed(0)}`   : "—",
    afRange:  ok.length ? `H:${Math.min(...ok.map(g => g.afH)).toFixed(0)}–${Math.max(...ok.map(g => g.afH)).toFixed(0)} A:${Math.min(...ok.map(g => g.afA)).toFixed(0)}–${Math.max(...ok.map(g => g.afA)).toFixed(0)}` : "—",
    shotsMarkHTRange: flatShotMarkHT.length ? `${Math.min(...flatShotMarkHT).toFixed(1)} – ${Math.max(...flatShotMarkHT).toFixed(1)}` : "—",
    shotsTotHTRange:  flatShotTotHT.length  ? `${Math.min(...flatShotTotHT).toFixed(1)} – ${Math.max(...flatShotTotHT).toFixed(1)}`  : "—",
    totalRows: validGames.length,
    parseOk:   ok.length,
  };
  return { games: validGames, dbg };
}

/* ─────────────────────────────────────────
   FAVORITO
───────────────────────────────────────── */
export function getFavorito(g) {
  // 🆕 Usar % AF (coluna 46) com fallback para AF bruto (coluna 41)
  const afHome = g?.asPrecisaoH || g?.afH || 0;  // % AF ou AF bruto como fallback
  const afAway = g?.asPrecisaoA || g?.afA || 0;  // % AF ou AF bruto como fallback

  if (!afHome || !afAway) {
    console.log(`❌ AF inválido: home=${afHome}, away=${afAway} (asPrecisao: H=${g?.asPrecisaoH}, A=${g?.asPrecisaoA} | af: H=${g?.afH}, A=${g?.afA})`);
    return { lado: "", nome: "", nomeUnder: "", afDiff: 0, afFav: 0, afUnder: 0, chFavGol: 0, chFavTot: 0, chUnderGol: 0, chUnderTot: 0, cantFavHT: 0, cantUnderHT: 0, cantFavFT: 0, gol05HTFav: 0 };
  }

  // 🆕 CORREÇÃO: O time com MAIOR AF é o favorito (não necessariamente a casa)
  const isHomeFavorito = afHome > afAway;  // > em vez de >= para evitar empates
  const isAwayFavorito = afAway > afHome;
  
  // Se ambos têm AF igual, sem favorito claro
  if (afHome === afAway) {
    return { lado: "", nome: "", nomeUnder: "", afDiff: 0, afFav: 0, afUnder: 0, chFavGol: 0, chFavTot: 0, chUnderGol: 0, chUnderTot: 0, cantFavHT: 0, cantUnderHT: 0, cantFavFT: 0, gol05HTFav: 0 };
  }

  const isCasa = isHomeFavorito;  // Casa só é favorito se tiver AF maior
  return {
    nome:        isCasa ? g.home  : g.away,
    nomeUnder:   isCasa ? g.away  : g.home,
    lado:        isCasa ? "🏠"   : "✈️",
    afFav:       Math.max(afHome, afAway),
    afUnder:     Math.min(afHome, afAway),
    afDiff:      Math.abs(afHome - afAway),
    chFavGol:    isCasa ? g.chHTH  : g.chHTA,
    chFavTot:    isCasa ? g.chTotH : g.chTotA,
    chUnderGol:  isCasa ? g.chHTA  : g.chHTH,
    chUnderTot:  isCasa ? g.chTotA : g.chTotH,
    cantFavHT:   isCasa ? g.cantHTH : g.cantHTA,
    cantUnderHT: isCasa ? g.cantHTA : g.cantHTH,
    cantFavFT:   isCasa ? g.cantFTH : g.cantFTA,
    gol05HTFav:  isCasa ? g.gol05HTH : g.gol05HTA,
  };
}

/* ─────────────────────────────────────────
   SCORE - CALIBRADO COM ALTA SENSIBILIDADE
   xG: 1.7–4.4 | xC: 8–12 | CV: 30–65 | afDiff: 6–51
───────────────────────────────────────── */
export function computeScore(g) {
  const fav = getFavorito(g);
  
  // Fatores normalizados com pesos otimizados - COM VALIDAÇÕES
  const factors = {
    // 1. Golos esperados (peso: 20%) - indicador forte [EMENDA v1.3]
    xG: {
      weight: 0.20,
      value: Math.max(Math.min(((g?.exG || 0) - 1.2) / 2.8, 1), 0), // Range 1.2-4.0 (mais flexível)
      description: "Potencial ofensivo"
    },
    
    // 2. Diferença de força (peso: 19%) - poderio ofensivo [CALIBRAGEM v1.2]
    afDiff: {
      weight: 0.19,
      value: Math.min(Math.abs((g?.asPrecisaoH || 0) - (g?.asPrecisaoA || 0)) / 35, 1), // Range 0-35 (mais flexível) - CORRIGIDO: usar % AF
      description: "Diferença de força"
    },
    
    // 3. Volatilidade (peso: 20%) - inverso, menor cv = maior score
    volatility: {
      weight: 0.20,
      value: Math.max(0, (70 - (g?.cv || 70)) / 45), // Range 25-70, invertido (mais flexível)
      description: "Consistência estatística"
    },
    
    // 4. Cantos esperados (peso: 22%) - foco HT [EMENDA v1.3]
    xC: {
      weight: 0.22,
      value: Math.max(Math.min(((g?.exC || 0) - 6) / 6, 1), 0), // Range 6-12
      description: "Volume de cantos"
    },
    
    // 5. Finalizações do favorito (peso: 13%) - foco HT [EMENDA v1.3]
    favShots: {
      weight: 0.13,
      value: Math.min((fav?.chFavGol || 0) / 4, 1), // Range 0-4
      description: "Pressão ofensiva HT"
    }
  };
  
  // Calcular score ponderado com ajuste fino
  let weightedScore = 0;
  let totalWeight = 0;
  
  Object.entries(factors).forEach(([key, factor]) => {
    const factorScore = factor.value * factor.weight;
    weightedScore += factorScore;
    totalWeight += factor.weight;
  });
  
  // Score base (média ponderada)
  let finalScore = weightedScore / totalWeight;
  
  // Bônus para combinações raras e poderosas
  const bonuses = [];
  
  // Bônus 1: Força extrema + Baixa volatilidade
  if ((fav?.afDiff || 0) > 30 && (g?.cv || 70) < 40) { // Ajustado para 40
    finalScore += 0.08;
    bonuses.push("Força extrema com baixa volatilidade");
  }
  
  // Bônus 2: Altos gols + Muitos cantos (jogo aberto)
  if ((g?.exG || 0) >= 3.0 && (g?.exC || 0) >= 9) { // Ajustado para 3.0 e 9
    finalScore += 0.06;
    bonuses.push("Jogo aberto (gols + cantos)");
  }
  
  // Bônus 3: Equilíbrio perfeito (diferença moderada + alta consistência)
  if ((fav?.afDiff || 0) >= 12 && (fav?.afDiff || 0) <= 22 && (g?.cv || 70) <= 40) { // Ajustado ranges
    finalScore += 0.04;
    bonuses.push("Equilíbrio otimizado");
  }
  
  // Bônus 4: Pressão HT consistente (chFavTot = total chutes HT, chFavGol = no gol)
  if ((fav?.chFavTot || 0) >= 2.5 && (fav?.chFavGol || 0) >= 3) { // Ajustado para 2.5 e 3
    finalScore += 0.03;
    bonuses.push("Pressão HT consistente");
  }
  
  // Penalizações severas para dados ruins
  if (g._miss.exG) finalScore -= 0.15; // Reduzido de 0.20
  if (g._miss.af) finalScore -= 0.10; // Reduzido de 0.15
  if (g._miss.cv) finalScore -= 0.08; // Reduzido de 0.10
  if (g._miss.exC) finalScore -= 0.05; // Reduzido de 0.08
  
  // Garantir range válido
  finalScore = Math.max(0, Math.min(1, finalScore));
  
  // Arredondamento preciso para melhor ranqueamento
  const roundedScore = Math.round(finalScore * 1000) / 1000;
  
  // Tratamento de NaN para garantir valores válidos
  const safeScore = isNaN(roundedScore) ? 0 : roundedScore;
  const safeFactors = Object.entries(factors).map(([key, factor]) => ({
    name: key,
    description: factor.description,
    value: isNaN(factor.value) ? 0 : factor.value,
    weight: isNaN(factor.weight) ? 0 : factor.weight,
    contribution: isNaN(factor.value * factor.weight) ? 0 : factor.value * factor.weight
  }));
  const safeBonuses = bonuses.filter(b => b != null);
  const missingData = g._miss.exG || g._miss.af || g._miss.cv || g._miss.exC;
  const totalPenalty = (g._miss.exG ? 0.20 : 0) + (g._miss.af ? 0.15 : 0) + (g._miss.cv ? 0.10 : 0) + (g._miss.exC ? 0.08 : 0);
  
  return {
    score: safeScore,
    factors: safeFactors,
    bonuses: safeBonuses,
    penalties: {
      missingData,
      totalPenalty
    }
  };
}

// Função legada para compatibilidade
export function getScore(g) {
  const result = computeScore(g);
  return result.score;
}

// Função legada para compatibilidade
export function getScoreResult(g) {
  return computeScore(g);
}

/* ─────────────────────────────────────────
   PERFIL
───────────────────────────────────────── */
export function classifyProfile(g) {
  const fav = getFavorito(g);
  if (fav.afDiff >= 40 && fav.afFav >= 70 && g.exG >= 3)                                     return "dominant";
  if (fav.afDiff >= 20 && fav.chFavGol >= 4 && g.exG >= 2.5)                                 return "chutes_ht_fav";
  if (g.exG >= 4 && fav.afDiff <= 15 && fav.afUnder >= 30)                                   return "high_offense_balanced";
  if (fav.afDiff >= 25 && g.exG >= 3)                                                         return "clear_favorite";
  if (fav.afDiff >= 15 && fav.afDiff < 25 && g.exG >= 3)                                     return "slight_fav_offensive";
  if (g.exC >= 11)                                                                             return "corner_dominant";
  if (fav.afDiff <= 15 && g.exG >= 3.5 && fav.afUnder >= 45 && g.cv <= 40)                   return "balanced_btts";
  if (fav.afDiff <= 20 && g.exG >= 3.2 && fav.afUnder >= 42 && g.cv <= 45)                   return "balanced_btts";
  if (fav.afDiff <= 12 && g.exG >= 2.5)                                                       return "balanced_moderate";
  if (fav.cantFavHT >= 5.5 && g.exC >= 9) return "corner_heavy";
  if (g.exC >= 9 && g.exG < 3)            return "corner_heavy";
  if (g.exG < 2.5 && g.cv >= 30)                                                              return "low_goals";
  return "generic";
}

export const PROFILES = {
  dominant:             { label: "🔥 Dominância Absoluta",       color: "#ff1744"    },
  chutes_ht_fav:        { label: "🎯 Pressão de Finalizações HT", color: "#ffd600" },
  high_offense_balanced:{ label: "⚡ Alta Ofensividade",          color: "#00e676"  },
  clear_favorite:       { label: "⭐ Favoritismo Claro",           color: "#ffd600" },
  slight_fav_offensive: { label: "📈 Leve Favorito Ofensivo",    color: "#00e676"  },
  corner_dominant:      { label: "🚩 Domínio de Cantos",          color: "#00c2ff" },
  balanced_btts:        { label: "💜 Equilibrado — Ambas Marcam", color: "#d500f9" },
  balanced_moderate:    { label: "⚖️ Equilibrado Moderado",       color: "#6f8aa6"  },
  corner_heavy:         { label: "🚩 Volume de Cantos",           color: "#00c2ff" },
  low_goals:            { label: "🔒 Jogo Travado",               color: "#ff9100" },
  generic:              { label: "📊 Padrão",                     color: "#6f8aa6"  },
};

/* ─────────────────────────────────────────
   MERCADO PRINCIPAL
───────────────────────────────────────── */
export function suggestMainMarket(g) {
  const score = getScore(g);
  
  // FILTRO DE ELITE - Só sugerir se score >= 50% (mais flexível para calibragem)
  if (score < 0.50) return null;
  const fav = getFavorito(g);
  // HIERARQUIA DE EXIBIÇÃO - Preferência Ativa por Mercados HT [EMENDA v1.3]
  const profile = classifyProfile(g);
  
  // GARANTIA DE EXIBIÇÃO POR PERFIL - Cantos obrigatório [AJUSTE DE CAPTAÇÃO]
  if (profile === "corner_dominant" || profile === "corner_heavy") {
    // Sempre exibir mercado de cantos para estes perfis
    const cantHFav = fav.cantFavHT;
    const thresholdCantos = (fav.afFav > 80) ? 4.2 : 5.0;
    const cvCantosLimit = 65; // Flexibilização para perfis de cantos
    
    if (cantHFav >= thresholdCantos && (g.cvCantosHT || 0) <= cvCantosLimit) {
      return { label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT`, axis: "cantos_ht", icon: "🚩", color: "#00c2ff" };
    }
    // Fallback para cantos FT se HT não viável
    if (g.exC >= 10.0 && (g.cvCantos || 0) <= 45) {
      return { label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩", color: "#00c2ff" };
    }
  }
  
  // Prioridade: Cantos HT (se viável)
  if (profile === "corner_heavy") {
    const cantHFav = fav.cantFavHT;
    const thresholdCantos = (fav.afFav > 80) ? 4.8 : 5.0;
    if (cantHFav >= thresholdCantos && (g.cvCantosHT || 0) <= 55) {
      return { label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT`, axis: "cantos_ht", icon: "🚩", color: "#00c2ff" };
    }
  }

  // Fallback: Lógica tradicional
  const excludedLeaguesForHT = [
    "Championship",
    "Liga BetPlay",
    "Carioca Serie A",
    "League One",
    "AFC Champions League Elite",
    "Eredivisie",
    "1. Lig",
    "Europa Conference League",
    "Pro League",
    "Eerste Divisie",
    "Super Lig"
  ];

  // ✅ Verifica se o campeonato permite finalizações HT
  const allowsHTFinalizations = !excludedLeaguesForHT.some(excluded => 
    (g.league || '').toLowerCase().includes(excluded.toLowerCase())
  );

  switch (profile) {
    case "dominant":
      return { label: `${fav.lado} ${fav.nome} Vence + Over 1.5 FT`, axis: "fav_gols",  icon: "🔥", color: "#ff1744"    };

    case "chutes_ht_fav": {
      // Se não permite HT, usa alternativa
      if (!allowsHTFinalizations) {
        return { label: "Over 1.5 FT", axis: "gols", icon: "⚽", color: "#00e676" };
      }
      // GATILHO MANTEIGA: defesa adversária < 35 + ataque fav > 75 → eleva linha +1
      const dfZebraMain = fav.lado === '🏠' ? g.dfA : g.dfH;
      const manteiga = dfZebraMain > 0 && dfZebraMain < 35 && fav.afFav > 75;
      // Buffer +1 em cada linha. Manteiga eleva linha em +1 quando defesa adversária é fraquíssima
      if (fav.chFavGol >= 7) return { label: `${fav.lado} ${fav.nome} — Finalizações HT Over ${manteiga ? '6.5' : '5.5'}`, axis: "chutes_ht", icon: manteiga ? "🚀" : "🎯", color: "#ffd600" };
      if (fav.chFavGol >= 6) return { label: `${fav.lado} ${fav.nome} — Finalizações HT Over ${manteiga ? '5.5' : '4.5'}`, axis: "chutes_ht", icon: manteiga ? "🚀" : "🎯", color: "#ffd600" };
      if (fav.chFavGol >= 5) return { label: `${fav.lado} ${fav.nome} — Finalizações HT Over ${manteiga ? '4.5' : '3.5'}`, axis: "chutes_ht", icon: manteiga ? "🚀" : "🎯", color: "#ffd600" };
      return null; // buffer insuficiente
    }

    case "high_offense_balanced":
      return { label: "Over 2.5 FT + Ambas Marcam", axis: "gols_btts", icon: "⚽", color: "#00e676" };

    case "clear_favorite":
      return fav.afDiff >= 35
        ? { label: `${fav.lado} ${fav.nome} Vence + Over 0.5 HT`, axis: "golsHT_fav", icon: "⭐", color: "#ffd600" }
        : { label: `Over 1.5 FT + Over 0.5 HT`,                   axis: "gols",       icon: "⚽", color: "#00e676"  };

    case "slight_fav_offensive":
      return { label: "Over 1.5 FT", axis: "gols", icon: "⚽", color: "#00e676" };

    case "corner_dominant": {
      // Buffer extremo v1.2: exC >= 10.0 + cvCantos <= 40 (consistência de elite)
      if (g.exC >= 10.0 && (g.cvCantos || 0) <= 40) return { label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩", color: "#00c2ff" };
      return null;
    }
    
    case "corner_heavy": {
      const cantHFav = fav.cantFavHT;
      // Condição especial: afFav > 80 permite cantFavHT >= 3.8 [EMENDA v1.3]
      const thresholdCantos = (fav.afFav > 80) ? 4.2 : 3.9;
      const cvCantosLimit = 65; // Flexibilização para perfis de cantos
      
      if (cantHFav >= thresholdCantos && (g.cvCantosHT || 0) <= cvCantosLimit)
        return { label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT`, axis: "cantos_ht", icon: "🚩", color: "#00c2ff" };
      if (g.exC >= 10.0 && (g.cvCantos || 0) <= 40)
        return { label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩", color: "#00c2ff" };
      return null;
    }
    case "balanced_btts":
      return { label: "Ambas Marcam — Sim", axis: "btts", icon: "💜", color: "#d500f9" };

    case "balanced_moderate":
      return { label: "Over 1.5 FT", axis: "gols", icon: "⚽", color: "#00e676" };
    
    case "low_goals":
      return { label: "Under 2.5 FT", axis: "under", icon: "🔒", color: "#ff9100" };

    default:
      if (g.exG >= 3.5)                              return { label: "Over 2.5 FT",       axis: "gols",   icon: "⚽", color: "#00e676"  };
      if (g.exC >= 10.0 && g.cvCantos <= 40)        return { label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩", color: "#00c2ff" };
      return null;
  }
}

/* ─────────────────────────────────────────
   CORRELAÇÃO / MÚLTIPLA
───────────────────────────────────────── */
const CORR = [
  ["gols", "gols_btts", "golsHT_fav", "fav_gols"],
  ["cantos", "cantos_ht"],
  ["under"],
  ["btts", "gols_btts"],
  ["chutes_ht"],
];
function correlated(sel, axis) {
  return sel.some(s => {
    if (s.axis === axis) return true;
    for (const gr of CORR) if (gr.includes(s.axis) && gr.includes(axis)) return true;
    return false;
  });
}

// 🆕 Implicações lógicas que tornam combinações inválidas - Bug 2
const LOGICAL_IMPLICATIONS = [
  ['btts', 'gols'],       // BTTS implica Over 1.5 FT
  ['gols_btts', 'gols'],   // Over 2.5 + BTTS implica Over 1.5
  ['fav_gols', 'gols'],    // Favorito Vence + Over → implica Over 1.5
];

// 🆕 Verificar se combinação é logicamente redundante
function isLogicallyRedundant(axisA, axisB) {
  return LOGICAL_IMPLICATIONS.some(([a, b]) =>
    (axisA === a && axisB === b) || (axisA === b && axisB === a)
  );
}

export function suggestCombo(g) {
  const main = suggestMainMarket(g);
  const fav  = getFavorito(g);
  const profile = classifyProfile(g);
  
  // Verificar se main market existe (filtro de 65% pode retornar null)
  if (!main || !main.axis) {
    return []; // Retornar array vazio se não há mercado principal
  }
  const cands = [];
  
  // 🔥 GARANTIA DE EXIBIÇÃO POR PERFIL - Cantos primeiro no combo [AJUSTE DE CAPTAÇÃO]
  if (profile === "corner_dominant" || profile === "corner_heavy") {
    // Cantos como primeira sugestão para perfis de cantos
    const cantHFav = fav.cantFavHT;
    const thresholdCantos = (fav.afFav > 80) ? 4.2 : 3.9;
    const cvCantosLimit = 65; // Flexibilização para perfis de cantos
    
    if (cantHFav >= thresholdCantos && (g.cvCantosHT || 0) <= cvCantosLimit) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT`, axis: "cantos_ht", icon: "🚩" });
    }
  }

  // Métricas elite do favorito (baseadas no lado: 🏠 Casa ou ✈️ Fora)
  const favIsHome  = fav.lado === '🏠';
  const favAppg    = favIsHome ? (g.appgH ?? 0)       : (g.appgA ?? 0);
  const favAsPrec  = favIsHome ? (g.asPrecisaoH ?? 0) : (g.asPrecisaoA ?? 0);
  const favCant37  = favIsHome ? (g.cantos37HTH ?? 0) : (g.cantos37HTA ?? 0);

  // 🚫 Campeonatos que não devem ter finalizações HT sugeridas
  const excludedLeaguesForHT = [
    "Championship",
    "Liga BetPlay",
    "Carioca Serie A",
    "League One",
    "AFC Champions League Elite",
    "Eredivisie",
    "1. Lig",
    "Europa Conference League",
    "Pro League",
    "Eerste Divisie",
    "Super Lig"
  ];

  // ✅ Verifica se o campeonato permite finalizações HT
  const allowsHTFinalizations = !excludedLeaguesForHT.some(excluded => 
    (g.league || '').toLowerCase().includes(excluded.toLowerCase())
  );

  // 🔥 BYPASS DE DOMINÂNCIA ABSOLUTA — chFavGol >= 8 libera Over 6.5 sem exigir APPG/AS
  // Justificativa: volume de 8+ chutes ao gol no HT é evidência estatística suficiente por si só
  if (allowsHTFinalizations && fav.chFavGol >= 8 && main.axis === 'fav_gols') {
    cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 6.5`, axis: "chutes_ht", icon: "🔥" });
  }

  // ⚡ BYPASS BLITZ — gap ofensivo/defensivo >= 45 + chFavGol >= 6.5 + dfZebra < 30 [CALIBRAGEM v1.2]
  // dfZebra = 0 → dado ausente → blitzGap = 0 → bypass NÃO dispara (proteção de capital mantida)
  const dfZebra = fav.lado === '🏠' ? g.dfA : g.dfH;
  const blitzGap = dfZebra > 0 ? (fav.afFav - dfZebra) : 0;
  if (allowsHTFinalizations && blitzGap >= 45 && fav.chFavGol >= 6.5 && dfZebra < 30) {
    const blitzLine = fav.chFavGol >= 7 ? '5.5' : '4.5';
    cands.push({ label: `⚡ Blitz HT — ${fav.lado} ${fav.nome} Finalizações HT Over ${blitzLine}`, axis: "chutes_ht", icon: "⚡" });
  }

  // Chutes HT (apenas se permitido) — requer AS >= 35% E APPG >= 0.80 (Elite v1.1) + Buffer +1 + cvCantosHT <= 55
  // Filtro de Qualidade de Dados: se as_precisao == 0 OU appg == 0 → BLOQUEIO TOTAL [CALIBRAGEM v1.2]
  // Exceção: bypass de dominância extrema (chFavGol >= 8)
  const dadoExportado = (favAsPrec > 0 && favAppg > 0);
  const allowsHTByElite = favAsPrec >= 35 && favAppg >= 0.80 && dadoExportado;
  if (allowsHTFinalizations && allowsHTByElite && main.axis !== "chutes_ht") {
    if      (fav.chFavGol >= 7)                      cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 5.5`, axis: "chutes_ht", icon: "🎯" });
    else if (fav.chFavGol >= 6)                       cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 4.5`, axis: "chutes_ht", icon: "🎯" });
    else if (fav.chFavGol >= 5)                       cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 3.5`, axis: "chutes_ht", icon: "🎯" });
  }
  if (allowsHTFinalizations && allowsHTByElite && main.axis !== "chutes_ht" && fav.chFavTot >= 9)
    cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 6.5`, axis: "chutes_ht", icon: "🎯" });

  // 🔁 DIVERSIFICAÇÃO CROSS-AXIS — Cantos HT para perfis com pressão ofensiva
  // Não exige APPG (§4 é para finalizações, não cantos). Exige: cantFavHT com buffer, exC decente, CV controlado
  // Restaurado: este bloco foi removido no refatoramento 4b0c8a0 e era o principal gerador de cantos
  if (main.axis !== "cantos_ht" && main.axis !== "cantos"
      && !["low_goals"].includes(profile)
      && fav.cantFavHT >= 3.5
      && g.exC >= 8
      && (g.cvCantosHT || 0) <= 65
  ) {
    const linhaCantos = (fav.cantFavHT >= 5.5 && (g.percMais5EscanteiosHT || 0) >= 40) ? "4.5" : "3.5";
    cands.push({ label: `${fav.lado} ${fav.nome} — Over ${linhaCantos} Cantos HT`, axis: "cantos_ht", icon: "🚩" });
  }

  // Cantos FT — buffer extremo v1.2: APPG >= 0.90 + exC >= 10.0 + cvCantos <= 40 (elite)
  if (main.axis !== "cantos" && main.axis !== "cantos_ht" && g.exC >= 10.0 && g.cvCantos <= 40 && favAppg >= 0.90) {
    // Usar estatísticas de cantos por período para decisão mais inteligente
    const cantos0a10 = g.mediaEscanteios0a10 || 0;
    const cantos11a20 = g.mediaEscanteios11a20 || 0;
    const cantos21a30 = g.mediaEscanteios21a30 || 0;
    const cantos31a40 = g.mediaEscanteios31a40 || 0;
    
    // Verificar se há padrão de cantos no final do jogo
    const cantosFinalJogo = cantos21a30 + cantos31a40;
    
    if (cantosFinalJogo >= 4) {
      cands.push({ label: "Over 8.5 Cantos FT (Final)", axis: "cantos", icon: "🚩" });
    } else {
      cands.push({ label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩" });
    }
  }

  // Cantos HT — APPG >= 0.60 + Cant37 >= 0.20 (Flexibilização de Captação) + Buffer +1 + cvCantosHT <= 65
  // Flexibilização exclusiva para perfis de cantos
  const isCornerProfile = profile === "corner_dominant" || profile === "corner_heavy";
  const appgThreshold = isCornerProfile ? 0.60 : 0.65;
  const cant37Threshold = isCornerProfile ? 0.20 : 0.20;
  const cvCantosThreshold = isCornerProfile ? 65 : 55;
  
  const thresholdCantos = (fav.afFav > 80) ? 4.2 : 3.9;
  if (main.axis !== "cantos_ht" && main.axis !== "cantos" && fav.cantFavHT >= thresholdCantos && favAppg >= appgThreshold && favCant37 >= cant37Threshold && (g.cvCantosHT || 0) <= cvCantosThreshold) {
    const perc4EscanteiosHT = g.percMais4EscanteiosHT || 0;
    const perc5EscanteiosHT = g.percMais5EscanteiosHT || 0;
    
    // Buffer +1: Over 4.5 requer cantFavHT >= 5.5 + perc >= 45% | Over 3.5 requer cantFavHT >= 4.5
    if (fav.cantFavHT >= 5.5 && perc5EscanteiosHT >= 45) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 4.5 Cantos HT (${perc5EscanteiosHT.toFixed(0)}%)`, axis: "cantos_ht", icon: "🚩" });
    } else if (perc4EscanteiosHT >= 55) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT (${perc4EscanteiosHT.toFixed(0)}%)`, axis: "cantos_ht", icon: "🚩" });
    }
  }

  // Gol HT — raise para >= 68% + confirma volume de chutes HT do favorito
  if (fav.gol05HTFav >= 68 && fav.chFavTot >= 2.0 && !["golsHT_fav", "fav_gols"].includes(main.axis))
    cands.push({ label: `${fav.lado} ${fav.nome} — Over 0.5 Gols HT (${fav.gol05HTFav.toFixed(0)}%)`, axis: "golsHT_fav", icon: "⚽" });

  // Over 1.5 Gols HT (Total) — exHT >= 2.5 (buffer +1) + cvGolsHT <= 50 + exG >= 2.5
  // Ideal como perna de combo (odd esmagada isolada, mas agrega valor em múltipla)
  const exHT = (g.golsHTH || 0) + (g.golsHTA || 0);
  if (exHT >= 2.5 && (g.cvGolsHT || 100) <= 50 && g.exG >= 2.5 &&
      !["gols", "gols_btts", "golsHT_fav", "fav_gols"].includes(main.axis)) {
    cands.push({ label: `Over 1.5 Gols HT (média ${exHT.toFixed(1)})`, axis: "golsHT", icon: "⏱️" });
  }

  // Gols FT - 🆕 Melhorado com estatísticas de Over 2.5
  const percOver25 = g.percMais25Gols || 0;
  const mediaGolsMarcados = g.mediaGolsMarcados || 0;
  
  if (g.exG >= 3.5 && !["gols", "gols_btts", "fav_gols", "golsHT_fav"].includes(main.axis)) {
    if (percOver25 >= 65) {
      cands.push({ label: `Over 2.5 FT (${percOver25.toFixed(0)}%)`, axis: "gols", icon: "⚽" });
    } else {
      cands.push({ label: "Over 2.5 FT", axis: "gols", icon: "⚽" });
    }
  }
  
  if (g.exG >= 2.5 && !["gols", "gols_btts", "fav_gols", "golsHT_fav"].includes(main.axis)) {
    if (mediaGolsMarcados >= 2.5) {
      cands.push({ label: `Over 1.5 FT (${mediaGolsMarcados.toFixed(1)} média)`, axis: "gols", icon: "⚽" });
    } else {
      cands.push({ label: "Over 1.5 FT", axis: "gols", icon: "⚽" });
    }
  }

  // Under (baixa prioridade - usuário não gosta)
  if (g.exG < 2.2 && main.axis !== "under") // Mais restritivo
    cands.push({ label: "Under 2.5 FT", axis: "under", icon: "🔒" });

  // BTTS - 🆕 Melhorado com estatísticas detalhadas
  const bttsTierA = fav.afUnder >= 40 && g.exG >= 3.0 && g.cv <= 45;
  const bttsTierB = fav.afUnder >= 35 && g.exG >= 2.8 && g.cv <= 50 && fav.afDiff <= 25;
  
  // 🆕 Usar estatísticas de BTTS e gols sofridos
  const btsPercent = g.btsPercent || 0;
  const golsSofridos = g.golsSofridos || 0;
  const golsSofridosHT = g.golsHTSofridos || 0;
  
  // Verificar se ambos times têm probabilidade de marcar
  const ambosMarcamProb = btsPercent >= 50 && golsSofridos >= 1.0 && golsSofridosHT >= 0.3;
  
  if ((bttsTierA || bttsTierB || ambosMarcamProb) && !["btts", "gols_btts"].includes(main.axis)) {
    if (btsPercent >= 65) {
      cands.push({ label: `Ambas Marcam — Sim (${btsPercent.toFixed(0)}%)`, axis: "btts", icon: "💜" });
    } else {
      cands.push({ label: "Ambas Marcam — Sim", axis: "btts", icon: "💜" });
    }
  }

  // Favorito vence
  if (fav.afDiff >= 40 && !["fav_gols", "golsHT_fav"].includes(main.axis))
    cands.push({ label: `${fav.lado} ${fav.nome} Vence`, axis: "fav", icon: "⭐" });

  // 🚪 RETORNO COMPLETO - Sem limitadores de quantidade [AJUSTE DE CAPTAÇÃO]
  // Permitir múltiplas linhas simultâneas para máxima captação
  const selected = [main];
  const result   = [{ label: main.label, icon: main.icon, color: main.color }];
  for (const c of cands) {
    if (!correlated(selected, c.axis)) {
      // 🆕 Verificar redundância lógica - Bug 2
      const mainAxis = selected[0]?.axis;
      if (mainAxis && isLogicallyRedundant(mainAxis, c.axis)) {
        continue; // Pular combinações logicamente redundantes
      }
      
      selected.push(c);
      result.push({ label: c.label, icon: c.icon, color: "#e6f1ff" });
    }
  }
  return result;
}

/* ─────────────────────────────────────────
   SINFONIA DE PARDAIS (BET BUILDER MICRO-LINHAS)
───────────────────────────────────────── */
export function suggestBetBuilder(g) {
  const cands = [];
  const fav = getFavorito(g);
  const profile = classifyProfile(g);

  // 🚫 Campeonatos que não devem ter finalizações HT sugeridas
  const excludedLeaguesForHT = [
    "Championship",
    "Liga BetPlay",
    "Carioca Serie A",
    "League One",
    "AFC Champions League Elite",
    "Eredivisie",
    "1. Lig",
    "Europa Conference League",
    "Pro League",
    "Eerste Divisie",
    "Super Lig"
  ];
  const allowsHTFinalizations = !excludedLeaguesForHT.some(excluded => 
    (g.league || '').toLowerCase().includes(excluded.toLowerCase())
  );

    // 1. Chutes HT (Fav) - Micro-linha
    if (allowsHTFinalizations && fav.chFavGol >= 5.0) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 4.5`, axis: "chutes_ht", icon: "🎯", isMicro: true });
    } else if (allowsHTFinalizations && fav.chFavGol >= 3.5) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Finalizações HT Over 3.5`, axis: "chutes_ht", icon: "🎯", isMicro: true });
    }

    // 2. Cantos HT (Fav) - Micro-linha
    if (fav.cantFavHT >= 4.0) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 3.5 Cantos HT`, axis: "cantos_ht", icon: "🚩", isMicro: true });
    } else if (fav.cantFavHT >= 3.0) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 2.5 Cantos HT`, axis: "cantos_ht", icon: "🚩", isMicro: true });
    }

    // 3. Cantos FT (Geral) - Micro-linha
    if (g.exC >= 10.5) {
      cands.push({ label: "Over 8.5 Cantos FT", axis: "cantos", icon: "🚩", isMicro: true });
    } else if (g.exC >= 9.0) {
      cands.push({ label: "Over 7.5 Cantos FT", axis: "cantos", icon: "🚩", isMicro: true });
    }

    // 4. Gols HT - Micro-linha (Extremamente restrito pelo risco)
    if (fav.gol05HTFav >= 80 && ((g.golsHTH || 0) + (g.golsHTA || 0) >= 1.5)) {
      cands.push({ label: "Over 0.5 Gols HT", axis: "golsHT", icon: "⏱️", isMicro: true });
    }

    // 5. Gols FT - Micro-linha (Foco na dominância nos 90min)
    if (g.exG >= 2.5 && fav.afFav >= 60) {
      cands.push({ label: `${fav.lado} ${fav.nome} — Over 1.5 Gols FT`, axis: "gols", icon: "⚽", isMicro: true });
    } else if (g.exG >= 2.3) {
      cands.push({ label: "Over 1.5 FT", axis: "gols", icon: "⚽", isMicro: true });
    }

    // 6. Ambas Marcam (Apenas se o jogo for muito propício)
    if (g.btsPercent >= 55 && g.exG >= 2.5) {
      cands.push({ label: "Ambas Marcam — Sim", axis: "btts", icon: "💜", isMicro: true });
    }

  return cands;
}

/* ─────────────────────────────────────────
   CONFIDENCE CALCULATION - MÉDIA PONDERADA
───────────────────────────────────────── */
export function computeConfidence(g) {
  const reasons = [];
  const fav = getFavorito(g);
  
  // 🎯 Fatores com pesos dinâmicos - com validações seguras
  const factors = {
    // 1. Diferença de força (peso: 30%)
    afDiff: {
      weight: 0.30,
      value: Math.min((fav?.afDiff || 0) / 40, 1), // Normalizado para 0-1, max em 40 (mais flexível)
      score: 0
    },
    
    // 2. Volatilidade (peso: 25%) - inverso (menor cv = maior confiança)
    volatility: {
      weight: 0.25,
      value: Math.max(0, (70 - (g?.cv || 70)) / 45), // Normalizado, cv < 40 = máximo (mais flexível)
      score: 0
    },
    
    // 3. Golos esperados (peso: 20%)
    expectedGoals: {
      weight: 0.20,
      value: Math.min((g?.exG || 0) / 3.5, 1), // Normalizado, max em 3.5 xG (mais flexível)
      score: 0
    },
    
    // 4. Finalizações HT (peso: 15%)
    htShots: {
      weight: 0.15,
      value: Math.min((fav?.chFavTot || 0) / 3, 1), // Normalizado, max em 3 chutes HT (mais flexível)
      score: 0
    },
    
    // 5. Probabilidade de gol HT (peso: 10%)
    htGoalsProb: {
      weight: 0.10,
      value: (fav?.gol05HTFav || 0) / 100, // Já está em percentual
      score: 0
    },
    
    // 🆕 6. Percentual BTTS (peso: 8%)
    bttsPercent: {
      weight: 0.08,
      value: (g?.btsPercent || 0) / 100, // Percentual de ambas marcam
      score: 0
    },
    
    // 🆕 7. Força de defesa (peso: 7%)
    defenseForce: {
      weight: 0.07,
      value: (g?.dfDefesa || 0) / 100, // Percentual de força de defesa
      score: 0
    },
    
    // 🆕 8. Percentual Over 2.5 (peso: 5%)
    over25Percent: {
      weight: 0.05,
      value: (g?.percMais25Gols || 0) / 100, // Percentual de Over 2.5
      score: 0
    },
    
    // 🆕 9. CV Cantos (peso: 5%)
    cornersCV: {
      weight: 0.05,
      value: Math.max(0, (80 - (g?.cvCantos || 80)) / 50), // Inverso: menor CV = maior confiança
      score: 0
    }
  };
  
  // 📊 Calcular scores ponderados
  let weightedSum = 0;
  let totalWeight = 0;
  
  Object.entries(factors).forEach(([key, factor]) => {
    factor.score = factor.value * factor.weight;
    weightedSum += factor.score;
    totalWeight += factor.weight;
    
    // Adicionar reasons explicativos
    if (factor.value >= 0.8) {
      reasons.push(`${key}: Excelente (${(factor.value * 100).toFixed(0)}%)`);
    } else if (factor.value >= 0.6) {
      reasons.push(`${key}: Bom (${(factor.value * 100).toFixed(0)}%)`);
    } else if (factor.value >= 0.4) {
      reasons.push(`${key}: Moderado (${(factor.value * 100).toFixed(0)}%)`);
    } else {
      reasons.push(`${key}: Baixo (${(factor.value * 100).toFixed(0)}%)`);
    }
  });
  
  // 🎯 Confiança final (média ponderada)
  let confidence = weightedSum / totalWeight;
  
  // 🚫 Penalizações por dados ausentes
  if (g._miss.exG) { confidence -= 0.15; reasons.push("xG ausente"); }
  if (g._miss.exC) { confidence -= 0.10; reasons.push("xC ausente"); }
  if (g._miss.cv)  { confidence -= 0.10; reasons.push("CV ausente"); }
  if (g._miss.af)  { confidence -= 0.15; reasons.push("AF ausente"); }
  
  // ✅ Garantir range válido
  confidence = Math.max(0, Math.min(1, confidence));
  
  // 🎯 Bônus para condições extremas (afDiff > 35 E cv < 40)
  if ((fav?.afDiff || 0) > 35 && (g?.cv || 70) < 40) {
    confidence = Math.min(confidence + 0.10, 0.95); // Máximo 95%
    reasons.push("Condições extremas favoráveis");
  }
  
  // 🛡️ Tratamento de NaN para garantir valores válidos
  const safeConfidence = isNaN(confidence) ? 0 : confidence;
  
  // --- INÍCIO DA CURVA DE NORMALIZAÇÃO ---
  // Multiplicamos a confiança bruta por 1.5 para alinhar a escala com a realidade, 
  // limitando o teto a 0.99 (99%) para evitar falsos 100%.
  const rawConfidence = safeConfidence;
  const normalizedConfidence = Math.min(rawConfidence * 1.5, 0.99);
  // --- FIM DA CURVA DE NORMALIZAÇÃO ---
  
  const safeFactors = Object.entries(factors).map(([key, factor]) => ({
    name: key,
    value: isNaN(factor.value) ? 0 : factor.value,
    weight: isNaN(factor.weight) ? 0 : factor.weight,
    score: isNaN(factor.score) ? 0 : factor.score
  }));
  
  return {
    score: normalizedConfidence,
    reasons,
    factors: safeFactors
  };
}

/* ─────────────────────────────────────────
   RISK MANAGEMENT
───────────────────────────────────────── */
export function calculateRiskAdjustedStake(g, baseStake, bankroll = 1000, currentDayStake = 0, maxDailyStake = 10) {
  // Don't exceed daily stake limit
  if (currentDayStake >= maxDailyStake) return 0;
  
  // Kelly criterion approximation (conservative)
  const confidence = computeConfidence(g).score;
  const kellyFraction = confidence * 0.25; // Conservative 25% of full Kelly
  
  // Volatility adjustment
  const volatilityPenalty = g.cv > 50 ? 0.7 : g.cv > 40 ? 0.85 : 1.0;
  
  // Data quality adjustment
  const dataQualityPenalty = g._miss.exG ? 0.5 : g._miss.exC ? 0.8 : 1.0;
  
  const adjustedStake = baseStake * kellyFraction * volatilityPenalty * dataQualityPenalty;
  
  // Respect daily limit
  const availableStake = maxDailyStake - currentDayStake;
  return Math.min(adjustedStake, availableStake);
}

export function shouldSkipBet(g, minConfidence = 0.50, maxOdds = 20.0, minOdd = 1.40) {
  const confidence = computeConfidence(g).score;
  const mainMarket = suggestMainMarket(g);
  
  // 🚨 Verificar se há mercado principal
  if (!mainMarket || !mainMarket.label) {
    return true; // Pular se não há mercado principal
  }
  
  const odd = getOddForLabel(g, mainMarket.label);
  
  // Skip if confidence too low
  if (confidence < minConfidence) return true;
  
  // 🚨 Pisos Dinâmicos: Filtrar odds muito esmagadas para apostas singulares (Panorama)
  // O piso padrão é 1.40 para garantir um mínimo de EV (Expected Value)
  if (odd && odd < minOdd) return true;
  
  // Apenas barrar odds absurdamente altas que indicam erro no dado
  if (odd && odd > maxOdds) return true;
  
  // Skip if critical data missing
  if (g._miss.exG && g._miss.af) return true;
  
  return false;
}

/* ─────────────────────────────────────────
   POISON DETECTION — GATILHOS ANALÍTICOS EXCEPCIONAIS
   Identifica jogos cujos dados de construção se destacam
   estatisticamente, ativando gatilhos raros do motor.
───────────────────────────────────────── */
export function detectPoisonTriggers(g) {
  const fav = getFavorito(g);
  const scoreResult = computeScore(g);
  const score = scoreResult?.score || 0;
  const bonuses = scoreResult?.bonuses || [];
  const confidence = computeConfidence(g)?.score || 0;
  const profile = classifyProfile(g);
  const triggers = [];

  // ── Nível 1: 🔥 Dominância Absoluta (chFavGol >= 8) ──
  if (fav.chFavGol >= 8) {
    triggers.push({
      level: 1,
      icon: "🔥",
      tag: "DOMINÂNCIA",
      color: "#ff1744",
      glow: "#ff174480",
      reason: `chFavGol = ${fav.chFavGol.toFixed(1)} — bypass de elite ativado (≥8)`,
    });
  }

  // ── Nível 2: ⚡ Blitz (gap >= 45 + chFavGol >= 6.5 + dfZebra < 30) ──
  const dfZebra = fav.lado === '🏠' ? (g.dfA || 0) : (g.dfH || 0);
  const blitzGap = dfZebra > 0 ? (fav.afFav - dfZebra) : 0;
  if (blitzGap >= 45 && fav.chFavGol >= 6.5 && dfZebra > 0 && dfZebra < 30) {
    triggers.push({
      level: 2,
      icon: "⚡",
      tag: "BLITZ",
      color: "#ffd600",
      glow: "#ffd60080",
      reason: `Gap ${blitzGap.toFixed(0)} (AF ${fav.afFav.toFixed(0)} vs Def ${dfZebra.toFixed(0)}) + chFavGol ${fav.chFavGol.toFixed(1)}`,
    });
  }

  // ── Nível 3: 🚀 Manteiga (dfZebra < 35 + afFav > 75) ──
  const dfZebraMain = fav.lado === '🏠' ? (g.dfA || 0) : (g.dfH || 0);
  if (dfZebraMain > 0 && dfZebraMain < 35 && fav.afFav > 75) {
    triggers.push({
      level: 3,
      icon: "🚀",
      tag: "MANTEIGA",
      color: "#ff9100",
      glow: "#ff910080",
      reason: `Def adversária frágil (${dfZebraMain.toFixed(0)}) + Ataque fav forte (${fav.afFav.toFixed(0)}) — linha elevada +1`,
    });
  }

  // ── Nível 4: 💎 Bônus Compostos (2+ bônus empilhados) ──
  if (bonuses.length >= 2) {
    triggers.push({
      level: 4,
      icon: "💎",
      tag: "COMPOSTO",
      color: "#d500f9",
      glow: "#d500f980",
      reason: `${bonuses.length} bônus: ${bonuses.join(" + ")}`,
    });
  }

  // ── Nível 5: ✨ Dupla Confirmação (score >= 75% + confidence >= 75%) ──
  if (score >= 0.75 && confidence >= 0.75) {
    triggers.push({
      level: 5,
      icon: "✨",
      tag: "DUAL",
      color: "#00e5ff",
      glow: "#00e5ff80",
      reason: `Score ${(score * 100).toFixed(0)}% + Confiança ${(confidence * 100).toFixed(0)}% — dupla confirmação`,
    });
  }

  return {
    isPoison: triggers.length > 0,
    triggers,
    highestLevel: triggers.length > 0 ? Math.min(...triggers.map(t => t.level)) : 0,
    primaryTrigger: triggers.length > 0 ? triggers.reduce((a, b) => a.level < b.level ? a : b) : null,
  };
}

/* ─────────────────────────────────────────
   VALUE BET DETECTION - PROBABILIDADE DINÂMICA
───────────────────────────────────────── */

// 🆕 Função auxiliar para calcular nossa probabilidade
function calcOurProb(g, marketLabel, score = null, fav = null, profile = null) {
  // 🎯 Obter score e confiança dinâmicos com validação
  const scoreResult = score !== null ? { score } : computeScore(g);
  const finalScore = score !== null ? score : (scoreResult?.score || 0);
  const confidence = computeConfidence(g)?.score || 0;
  const finalProfile = profile !== null ? profile : classifyProfile(g);
  const finalFav = fav !== null ? fav : getFavorito(g);
  
  // 📊 Probabilidade real baseada no score (dinâmica)
  let ourProb = 0;
  
  // Base probability from score (0.60 - 0.95 range) - Equilibrado para odds realistas
  ourProb = 0.60 + (finalScore * 0.35);
  
  // 🎯 Ajuste fino baseado no mercado específico
  const marketAdjustments = {
    // Finalizações HT - depende de chutes e força
    'finalizacoes_ht': () => {
      const shotProb = Math.min((finalFav?.chFavGol || 0) / 8, 0.9); // Max 90% se muitos chutes
      const strengthBonus = Math.min((finalFav?.afDiff || 0) / 60, 0.1); // Bônus por força
      return ourProb + shotProb * 0.3 + strengthBonus;
    },
    
    // Gols HT - depende de probabilidade histórica
    'gols_ht': () => {
      const htProb = (finalFav?.gol05HTFav || 0) / 100;
      return ourProb + htProb * 0.4;
    },
    
    // Over 1.5 FT - baseado em xG
    'over_15_ft': () => {
      const xgProb = Math.min((g?.exG || 0) / 4, 0.85);
      return ourProb + xgProb * 0.3;
    },
    
    // Over 2.5 FT - mais exigente
    'over_25_ft': () => {
      const xgProb = Math.min((g?.exG || 0) / 5, 0.75);
      return ourProb + xgProb * 0.25;
    },
    
    // Cantos - baseado em xC
    'cantos': () => {
      const cornerProb = Math.min((g?.exC || 0) / 12, 0.8);
      return ourProb + cornerProb * 0.3;
    },
    
    // BTTS - depende de equilíbrio ofensivo
    'btts': () => {
      const balanceBonus = ((finalFav?.afDiff || 0) <= 20 && (g?.exG || 0) >= 3) ? 0.15 : 0.05;
      return ourProb + balanceBonus;
    },
    
    // Favorito vence - baseado em diferença de força
    'fav': () => {
      const winProb = Math.min((finalFav?.afDiff || 0) / 80, 0.9);
      return ourProb + winProb * 0.4;
    }
  };
  
  // 🔍 Identificar tipo de mercado e aplicar ajuste
  let marketKey = 'generic';
  if (marketLabel.includes('Finalizações HT')) marketKey = 'finalizacoes_ht';
  else if (marketLabel.includes('Gols HT')) marketKey = 'gols_ht';
  else if (marketLabel.includes('Over 1.5')) marketKey = 'over_15_ft';
  else if (marketLabel.includes('Over 2.5')) marketKey = 'over_25_ft';
  else if (marketLabel.includes('Cantos')) marketKey = 'cantos';
  else if (marketLabel.includes('Ambas Marcam')) marketKey = 'btts';
  else if (marketLabel.includes('Vence')) marketKey = 'fav';
  
  // 🎯 Aplicar ajuste específico do mercado
  if (marketAdjustments[marketKey]) {
    ourProb = marketAdjustments[marketKey]();
  }
  
  // 📈 Ajuste por perfil (bônus para perfis específicos)
  const profileBonus = {
    dominant: 0.08,
    chutes_ht_fav: 0.06,
    high_offense_balanced: 0.05,
    clear_favorite: 0.04,
    corner_dominant: 0.03,
    generic: 0
  };
  
  ourProb += profileBonus[finalProfile] || 0;
  
  // ✅ Garantir range válido (0 - 0.95 máximo)
  ourProb = Math.max(0.05, Math.min(0.95, ourProb));
  
  return ourProb;
}

export function calculateValueBet(g, marketLabel, resolution) {
  // BLOCO DE COMPATIBILIDADE — suporta chamada antiga (odd: number) e nova (OddsResolution)
  let marketOdd, minOdd, source
  if (resolution !== null && typeof resolution === 'object' && 'marketOdd' in resolution) {
    // Nova interface OddsResolution
    marketOdd = resolution.marketOdd
    minOdd    = resolution.minOdd
    source    = resolution.source
  } else {
    // Chamada legada: calculateValueBet(g, label, 1.85)
    marketOdd = (typeof resolution === 'number' && resolution > 1.01) ? resolution : null
    minOdd    = getMinOddForLabel(marketLabel) ?? 1.30
    source    = marketOdd ? 'legacy' : null
  }

  // ← ESTAS 4 LINHAS ESTAVAM FALTANDO (causando os 2 erros)
  const _scoreResult  = computeScore(g)
  const score         = typeof _scoreResult === 'number' ? _scoreResult : (_scoreResult?.score ?? 0)
  const confidence    = computeConfidence(g)?.score ?? 0
  const fav           = getFavorito(g)
  const profile       = classifyProfile(g)

  // Se sem odd real, retornar apenas minOdd + ourProb
  if (marketOdd === null) {
    const ourProb = calcOurProb(g, marketLabel, score, fav, profile)
    return {
      hasValue: null,
      edge: null,
      impliedProb: null,
      ourProb: Math.round(ourProb * 100),
      minOdd: minOdd,
      recommendation: 'Odd real indisponível',
      dataSource: source,
      score: Math.round(score * 100),
      confidence: Math.round(confidence * 100),
    }
  }

  // Com odd real — cálculo normal de EV
  if (marketOdd <= 1.01) {
    return { hasValue: false, edge: 0, impliedProb: 0, ourProb: 0, minOdd, dataSource: source }
  }

  const impliedProb = 1 / marketOdd
  const ourProb     = calcOurProb(g, marketLabel, score, fav, profile)
  const edge        = ourProb - impliedProb
  const hasValue    = edge > 0.02

  const safeEdge       = isNaN(edge) ? 0 : edge
  const safeImpliedProb = isNaN(impliedProb) ? 0 : impliedProb
  const safeOurProb    = isNaN(ourProb) ? 0 : ourProb

  return {
    hasValue: !isNaN(safeEdge) && safeEdge > 0.02,
    edge:         Math.round(safeEdge * 100),
    impliedProb:  Math.round(safeImpliedProb * 100),
    ourProb:      Math.round(safeOurProb * 100),
    minOdd,
    recommendation: safeEdge > 0.08 ? 'Forte valor'
                  : safeEdge > 0.04 ? 'Valor moderado'
                  : safeEdge > 0.02 ? 'Valor baixo'
                  : 'Sem valor',
    dataSource: source,
    score:      Math.round(score * 100),
    confidence: Math.round(confidence * 100),
  }
}

/* ─────────────────────────────────────────
   CALIBRATION IMPROVEMENTS
───────────────────────────────────────── */
export function calibrateScore(g, historicalAvg = {}) {
  const baseScore = computeScore(g);
  
  // League-specific calibration (if historical data available)
  const leagueKey = g.league?.toLowerCase().trim();
  const leagueMultiplier = historicalAvg[leagueKey] || 1.0;
  
  // Time-based adjustment (recent form weight)
  const timeWeight = g.hour ? 
    (parseInt(g.hour.split(':')[0]) >= 18 ? 1.05 : 0.95) : 1.0;
  
  // Home advantage adjustment
  const homeAdvantage = g.afH > g.afA ? 1.02 : 0.98;
  
  return Math.max(0, Math.min(1, baseScore * leagueMultiplier * timeWeight * homeAdvantage));
}

/* ─────────────────────────────────────────
   GAME EXPLANATION
───────────────────────────────────────── */
export function explainGame(g) {
  const fav = getFavorito(g);
  const profile = classifyProfile(g);
  const explanations = [];

  // Basic stats explanation
  if (g.exG >= 3.5) {
    explanations.push(`🔥 Alto potencial ofensivo (${g.exG.toFixed(2)} xG)`);
  } else if (g.exG >= 2.5) {
    explanations.push(`⚽ Potencial ofensivo moderado (${g.exG.toFixed(2)} xG)`);
  } else {
    explanations.push(`🔒 Baixo potencial de gols (${g.exG.toFixed(2)} xG)`);
  }

  // Corner analysis
  if (g.exC >= 11) {
    explanations.push(`🚩 Volume muito alto de cantos (${g.exC.toFixed(1)} xC)`);
  } else if (g.exC >= 9) {
    explanations.push(`🚩 Bom volume de cantos (${g.exC.toFixed(1)} xC)`);
  }

  // Favorite analysis
  if (fav.afDiff >= 30) {
    explanations.push(`⭐ Favorito claro: ${fav.nome} (${fav.afFav.toFixed(0)} AF vs ${fav.afUnder.toFixed(0)})`);
  } else if (fav.afDiff >= 15) {
    explanations.push(`📈 Leve favorito: ${fav.nome} (${fav.afFav.toFixed(0)} AF vs ${fav.afUnder.toFixed(0)})`);
  } else {
    explanations.push(`⚖️ Jogo equilibrado (${fav.afFav.toFixed(0)} vs ${fav.afUnder.toFixed(0)} AF)`);
  }

  // HT shots analysis
  if (fav.chFavGol >= 5) {
    explanations.push(`🎯 ${fav.nome} com forte pressão ofensiva no 1ºT (${fav.chFavGol.toFixed(1)} chutes ao gol HT)`);
  }

  // CV analysis
  if (g.cv <= 35) {
    explanations.push(`📊 Baixa volatilidade (${g.cv.toFixed(0)}% CV)`);
  } else if (g.cv >= 50) {
    explanations.push(`⚠️ Alta volatilidade (${g.cv.toFixed(0)}% CV)`);
  }

  return explanations;
}
