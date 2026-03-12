"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameToMatchInput = gameToMatchInput;
/**
 * Mapa CSV → MatchInput
 * Colunas: engine.js parseCSV (47 colunas, sep ';' ou ',')
 * Col 9  = oddOver25FT   (Odds Mais de 2.5 gols FT)
 * Col 12 = oddBTTSYes    (Odds Ambas marcarem Sim)
 * Col 13 = oddOver05HT   (Odds Mais de 0.5 gols 1T)
 * Col 25 = exGTotal      (xG)
 * Col 32 = af            (Força de ataque H|A)
 * Col 34 = gol05HT       (% Over 0.5 gols HT H|A)
 * Col 37 = btsPercent    (% Ambas marcam)
 * Col 44 = favoritismo
 */
function parsePipe(val, side) {
    if (!val)
        return null;
    const parts = String(val).split('|');
    const n = parseFloat(side === 'h' ? parts[0] : parts[1]);
    return isNaN(n) ? null : n;
}
function parseNum(val) {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}
function calcFieldCoverage(game) {
    const fields = [
        game.exGTotal,
        game.afH,
        game.afA,
        game.gol05HTH,
        game.gol05HTA,
        game.chHTFav,
        game.cantHT,
        game.league,
        game.hour,
    ];
    const filled = fields.filter((f) => f != null && f !== '' && f !== 0).length;
    return filled / fields.length;
}
function gameToMatchInput(game) {
    // af vem como "65|48" → afHome=65, afAway=48
    const afH = parsePipe(game.af, 'h') ?? game.afH ?? null;
    const afA = parsePipe(game.af, 'a') ?? game.afA ?? null;
    // gol05HT vem como "72|58"
    const gol05HTH = parsePipe(game.gol05HT, 'h') ?? game.gol05HTH ?? null;
    const gol05HTA = parsePipe(game.gol05HT, 'a') ?? game.gol05HTA ?? null;
    const exGTotal = parseNum(game.exGTotal ?? game.exG) ?? null;
    // Deriva lambda home/away via af se não tiver direto
    const lambdaHomeFT = exGTotal != null && afH != null && afA != null
        ? exGTotal * (afH / Math.max(1, afH + afA))
        : null;
    const lambdaAwayFT = exGTotal != null && afH != null && afA != null
        ? exGTotal * (afA / Math.max(1, afH + afA))
        : null;
    // Odds reais injetadas via API (game.odds vem do ODDS-INJECT)
    const hasRealOdds = !!game.hasRealOdds;
    // Obter odds das colunas CSV ou do objeto odds injetado
    const oddOver05HT = parseNum(game.odds?.over05HT ?? game.oddOver05HT ?? game.col13) ?? undefined;
    const oddOver15FT = parseNum(game.odds?.over15FT ?? game.oddOver15FT ?? game.col14) ?? undefined;
    const oddOver25FT = parseNum(game.odds?.over25FT ?? game.rawOddOver25FT ?? game.col9) ?? undefined;
    const oddBTTSYes = parseNum(game.odds?.bttsYes ?? game.rawOddBTTS ?? game.col12) ?? undefined;
    // Chutes HT para lambda HT (se disponível)
    const chHTFav = game.chHTFav ? Number(game.chHTFav) : null;
    return {
        dataMode: hasRealOdds ? 'csv_plus_api' : 'csv_only',
        league: game.league ?? undefined,
        // Odds
        oddOver05HT,
        oddOver15FT,
        oddOver25FT,
        oddBTTSYes,
        // Lambdas
        exGTotal: exGTotal ?? undefined,
        exGHome: lambdaHomeFT ?? undefined,
        exGAway: lambdaAwayFT ?? undefined,
        lambdaHomeFT: lambdaHomeFT ?? undefined,
        lambdaAwayFT: lambdaAwayFT ?? undefined,
        lambdaHT: chHTFav ? chHTFav * 0.44 : undefined,
        // Auxiliares
        afHome: afH ?? undefined,
        afAway: afA ?? undefined,
        pctGoal05HTHome: gol05HTH ? gol05HTH / 100 : undefined,
        pctGoal05HTAway: gol05HTA ? gol05HTA / 100 : undefined,
        pctBTTSHome: parseNum(game.btsPercent) ? parseNum(game.btsPercent) / 100 : undefined,
        // Qualidade
        fieldCoverage: calcFieldCoverage({ ...game, afH, afA, gol05HTH, gol05HTA }),
        sourceFreshnessHours: 12, // CSV diário
    };
}
