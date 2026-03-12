"use strict";
// src/lib/trigger-validation.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.runValidation = runValidation;
exports.compareSystems = compareSystems;
const trigger_map_1 = require("./trigger-map");
// Função legado para comparação (copiada do trigger-map)
function getEligibleMarketsLegacy(game) {
    const TRIGGER_MAP = {
        'Over 0.5 Gols HT': (g) => {
            const afH = Number(g.afH ?? 0);
            const afA = Number(g.afA ?? 0);
            const isFavHome = afH >= afA;
            const pct = isFavHome
                ? Number(g.gol05HTH ?? 0)
                : Number(g.gol05HTA ?? 0);
            return pct >= 65;
        },
        'Over 1.5 FT': (g) => Number(g.exG ?? 0) >= 2.5,
        'Over 2.5 FT': (g) => Number(g.exG ?? 0) >= 3.2 &&
            Math.max(Number(g.perc25H ?? 0), Number(g.perc25A ?? 0)) >= 50,
        'Ambas Marcam Sim': (g) => {
            const pctH = Number(g.percBTTSH ?? 0);
            const pctA = Number(g.percBTTSA ?? 0);
            if (pctH >= 50 && pctA >= 45)
                return true;
            const golsH = Number(g.golsH ?? g.golsHTH ?? 0);
            const golsA = Number(g.golsA ?? g.golsHTA ?? 0);
            const sofH = Number(g.golsSofH ?? 0);
            const sofA = Number(g.golsSofA ?? 0);
            return golsH >= 0.9 && golsA >= 0.9 && sofH >= 0.8 && sofA >= 0.8;
        },
    };
    const markets = Object.entries(TRIGGER_MAP)
        .filter(([label, fn]) => !label.startsWith('__') && fn(game))
        .map(([label]) => label);
    return markets;
}
// Dados de teste simulando jogos reais
const testGames = [
    {
        home: 'Flamengo',
        away: 'Vasco',
        match: 'Flamengo x Vasco',
        league: 'Serie A',
        hour: '12/02 15:00',
        status: 'NS',
        exG: 2.85,
        af: '65|48',
        gol05HT: '72|58',
        btsPercent: '68',
        favoritismo: 78.5,
        chHTFav: 5.2,
        cantHT: 6.8,
        odds: {
            over05HT: 1.85,
            over15FT: 1.65,
            over25FT: 2.10,
            bttsYes: 1.95,
        },
        hasRealOdds: true,
    },
    {
        home: 'Corinthians',
        away: 'Palmeiras',
        match: 'Corinthians x Palmeiras',
        league: 'Serie A',
        hour: '12/02 17:00',
        status: 'NS',
        exG: 3.2,
        af: '70|62',
        gol05HT: '78|65',
        btsPercent: '72',
        favoritismo: 52.3,
        chHTFav: 6.8,
        cantHT: 7.2,
        odds: {
            over05HT: 1.90,
            over15FT: 1.55,
            over25FT: 1.95,
            bttsYes: 1.85,
        },
        hasRealOdds: true,
    },
    {
        home: 'São Paulo',
        away: 'Santos',
        match: 'São Paulo x Santos',
        league: 'Serie A',
        hour: '12/02 19:00',
        status: 'NS',
        exG: 1.8,
        af: '58|51',
        gol05HT: '62|48',
        btsPercent: '55',
        favoritismo: 85.2,
        chHTFav: 4.1,
        cantHT: 5.5,
        odds: {
            over05HT: 2.10,
            over15FT: 2.35,
            over25FT: 3.10,
            bttsYes: 2.25,
        },
        hasRealOdds: true,
    },
    {
        home: 'Botafogo',
        away: 'Fluminense',
        match: 'Botafogo x Fluminense',
        league: 'Serie A',
        hour: '12/02 21:00',
        status: 'NS',
        exG: 2.1,
        af: '55|49',
        gol05HT: '58|45',
        btsPercent: '48',
        favoritismo: 61.8,
        chHTFav: 3.8,
        cantHT: 4.9,
        // Sem odds reais (CSV apenas)
        hasRealOdds: false,
    },
];
function compareSystems() {
    const results = [];
    testGames.forEach(game => {
        const legacyMarkets = getEligibleMarketsLegacy(game);
        const newMarkets = (0, trigger_map_1.getEligibleMarkets)(game);
        const overlap = legacyMarkets.filter(m => newMarkets.includes(m));
        const onlyLegacy = legacyMarkets.filter(m => !newMarkets.includes(m));
        const onlyNew = newMarkets.filter(m => !legacyMarkets.includes(m));
        const uniqueMarkets = Array.from(new Set([...legacyMarkets, ...newMarkets]));
        const totalUnique = uniqueMarkets.length;
        const agreement = totalUnique > 0 ? (overlap.length / totalUnique) * 100 : 100;
        results.push({
            game: game.match,
            legacyMarkets,
            newMarkets,
            legacyCount: legacyMarkets.length,
            newCount: newMarkets.length,
            overlap,
            onlyLegacy,
            onlyNew,
            agreement,
        });
    });
    return results;
}
function runValidation() {
    console.log('🔍 Validação Comparativa: Sistema Antigo vs Novo Motor Poisson\n');
    const results = compareSystems();
    // Estatísticas gerais
    const totalLegacy = results.reduce((sum, r) => sum + r.legacyCount, 0);
    const totalNew = results.reduce((sum, r) => sum + r.newCount, 0);
    const avgAgreement = results.reduce((sum, r) => sum + r.agreement, 0) / results.length;
    console.log('📊 Estatísticas Gerais:');
    console.log(`  Total mercados legado: ${totalLegacy}`);
    console.log(`  Total mercados novo: ${totalNew}`);
    console.log(`  Média concordância: ${avgAgreement.toFixed(1)}%\n`);
    // Detalhes por jogo
    results.forEach((result, index) => {
        console.log(`🎯 Jogo ${index + 1}: ${result.game}`);
        console.log(`  Legado (${result.legacyCount}): ${result.legacyMarkets.join(', ') || 'Nenhum'}`);
        console.log(`  Novo   (${result.newCount}): ${result.newMarkets.join(', ') || 'Nenhum'}`);
        console.log(`  Overlap: ${result.overlap.join(', ') || 'Nenhum'}`);
        console.log(`  Apenas legado: ${result.onlyLegacy.join(', ') || 'Nenhum'}`);
        console.log(`  Apenas novo: ${result.onlyNew.join(', ') || 'Nenhum'}`);
        console.log(`  Concordância: ${result.agreement.toFixed(1)}%\n`);
    });
    // Análise de qualidade
    console.log('📈 Análise de Qualidade:');
    const approvedMarkets = results.flatMap(r => r.newMarkets);
    const marketCounts = approvedMarkets.reduce((acc, market) => {
        acc[market] = (acc[market] || 0) + 1;
        return acc;
    }, {});
    console.log('  Mercados mais aprovados (novo sistema):');
    Object.entries(marketCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([market, count]) => {
        console.log(`    ${market}: ${count} jogos`);
    });
    // Edge cases
    const perfectMatches = results.filter(r => r.agreement === 100).length;
    const noMatches = results.filter(r => r.agreement === 0).length;
    console.log('\n🎯 Edge Cases:');
    console.log(`  Concordância perfeita: ${perfectMatches}/${results.length} jogos`);
    console.log(`  Sem concordância: ${noMatches}/${results.length} jogos`);
    // Recomendações
    console.log('\n💡 Recomendações:');
    if (avgAgreement >= 70) {
        console.log('  ✅ Alta concordância - pronto para produção');
    }
    else if (avgAgreement >= 50) {
        console.log('  ⚠️ Concordância moderada - ajustar configs antes de produção');
    }
    else {
        console.log('  ❌ Baixa concordância - revisar implementação');
    }
    if (totalNew > totalLegacy * 1.2) {
        console.log('  📈 Novo sistema encontrando mais oportunidades (bom sinal)');
    }
    else if (totalNew < totalLegacy * 0.8) {
        console.log('  📉 Novo sistema mais conservador (revisar configs)');
    }
    console.log('\n✅ Validação concluída!');
}
// Executar validação se este arquivo for rodado diretamente
if (typeof window === 'undefined' && typeof process !== 'undefined') {
    try {
        runValidation();
    }
    catch (error) {
        console.error('❌ Erro na validação:', error);
        process.exit(1);
    }
}
