"use strict";
// src/lib/trigger-engine.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIGGER_CONFIGS = void 0;
exports.evaluateTrigger = evaluateTrigger;
exports.evaluateAllMarkets = evaluateAllMarkets;
const factorial = (n) => {
    if (n <= 1)
        return 1;
    let acc = 1;
    for (let i = 2; i <= n; i++)
        acc *= i;
    return acc;
};
const poissonExact = (lambda, k) => Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
const poissonOver = (lambda, line) => {
    const floor = Math.floor(line);
    let cdf = 0;
    for (let i = 0; i <= floor; i++)
        cdf += poissonExact(lambda, i);
    return Math.max(0, Math.min(1, 1 - cdf));
};
const impliedProbFromOdd = (odd) => odd && odd > 1 ? 1 / odd : null;
const fairOddFromProb = (p) => p && p > 0 ? 1 / p : null;
const pctEdge = (modelProb, impliedProb) => modelProb != null && impliedProb != null ? (modelProb - impliedProb) * 100 : null;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const avg = (vals) => vals.reduce((a, b) => a + b, 0) / vals.length;
function resolveLambdaHomeFT(g) {
    if (g.lambdaHomeFT != null)
        return g.lambdaHomeFT;
    if (g.exGHome != null)
        return g.exGHome;
    if (g.exGTotal != null && g.afHome != null && g.afAway != null) {
        const sum = Math.max(1, g.afHome + g.afAway);
        return g.exGTotal * (g.afHome / sum);
    }
    return null;
}
function resolveLambdaAwayFT(g) {
    if (g.lambdaAwayFT != null)
        return g.lambdaAwayFT;
    if (g.exGAway != null)
        return g.exGAway;
    if (g.exGTotal != null && g.afHome != null && g.afAway != null) {
        const sum = Math.max(1, g.afHome + g.afAway);
        return g.exGTotal * (g.afAway / sum);
    }
    return null;
}
function resolveLambdaTotalFT(g) {
    const h = resolveLambdaHomeFT(g);
    const a = resolveLambdaAwayFT(g);
    if (h != null && a != null)
        return h + a;
    if (g.exGTotal != null)
        return g.exGTotal;
    return null;
}
function resolveLambdaHT(g) {
    if (g.lambdaHT != null)
        return g.lambdaHT;
    const totalFT = resolveLambdaTotalFT(g);
    if (totalFT != null)
        return totalFT * 0.44;
    return null;
}
function probBTTS(lambdaHome, lambdaAway) {
    const pHome0 = poissonExact(lambdaHome, 0);
    const pAway0 = poissonExact(lambdaAway, 0);
    const pBoth0 = pHome0 * pAway0;
    return clamp(1 - pHome0 - pAway0 + pBoth0, 0, 1);
}
function baseConfidence(g, minCoverage) {
    const coverage = g.fieldCoverage ?? 0;
    const freshness = g.sourceFreshnessHours ?? 999;
    let score = coverage * 100;
    if (coverage < minCoverage)
        score -= 20;
    if (g.dataMode === 'csv_only')
        score -= 12;
    if (freshness > 24)
        score -= 8;
    if (freshness > 72)
        score -= 10;
    return clamp(Math.round(score), 0, 100);
}
exports.TRIGGER_CONFIGS = {
    OVER_05_HT: {
        marketId: 'OVER_05_HT',
        enabled: true,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.65,
        minModelProb: 0.64,
        minEdgePct: 3.5,
        csvOnlyPenaltyPct: 2.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    OVER_15_FT: {
        marketId: 'OVER_15_FT',
        enabled: true,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.70,
        minModelProb: 0.72,
        minEdgePct: 4.0,
        csvOnlyPenaltyPct: 2.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    OVER_25_FT: {
        marketId: 'OVER_25_FT',
        enabled: true,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.72,
        minModelProb: 0.58,
        minEdgePct: 5.0,
        csvOnlyPenaltyPct: 2.5,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    BTTS_YES: {
        marketId: 'BTTS_YES',
        enabled: true,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.72,
        minModelProb: 0.56,
        minEdgePct: 4.0,
        csvOnlyPenaltyPct: 2.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    UNDER_25_FT: {
        marketId: 'UNDER_25_FT',
        enabled: false,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.75,
        minModelProb: 0.60,
        minEdgePct: 5.0,
        csvOnlyPenaltyPct: 3.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    CORNERS_FT: {
        marketId: 'CORNERS_FT',
        enabled: false,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.80,
        minModelProb: 0.60,
        minEdgePct: 5.0,
        csvOnlyPenaltyPct: 3.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
    SHOTS_HT: {
        marketId: 'SHOTS_HT',
        enabled: false,
        allowedDataModes: ['csv_only', 'csv_plus_api'],
        requiredFields: ['fieldCoverage', 'dataMode'],
        minCoverage: 0.80,
        minModelProb: 0.62,
        minEdgePct: 5.0,
        csvOnlyPenaltyPct: 3.0,
        reviewEdgeBufferPct: 1.0,
        statusRule: 'strict',
    },
};
function validateRequiredFields(g, fields) {
    return fields.every((f) => g[f] !== undefined && g[f] !== null);
}
function evaluateTrigger(g, cfg) {
    const reasons = [];
    let modelProb = null;
    let impliedProb = null;
    let edgePct = null;
    let fairOdd = null;
    if (!cfg.enabled) {
        return {
            marketId: cfg.marketId,
            status: 'BLOCKED',
            modelProb: null,
            impliedProb: null,
            edgePct: null,
            confidenceScore: 0,
            fairOdd: null,
            reasons: ['MARKET_DISABLED'],
            debug: {},
        };
    }
    if (!cfg.allowedDataModes.includes(g.dataMode)) {
        return {
            marketId: cfg.marketId,
            status: 'BLOCKED',
            modelProb: null,
            impliedProb: null,
            edgePct: null,
            confidenceScore: 0,
            fairOdd: null,
            reasons: ['REQUIRES_API_ENRICHMENT'],
            debug: { dataMode: g.dataMode },
        };
    }
    if (!validateRequiredFields(g, cfg.requiredFields)) {
        return {
            marketId: cfg.marketId,
            status: 'BLOCKED',
            modelProb: null,
            impliedProb: null,
            edgePct: null,
            confidenceScore: 0,
            fairOdd: null,
            reasons: ['MISSING_CORE_FIELDS'],
            debug: {},
        };
    }
    const coverage = g.fieldCoverage ?? 0;
    let confidenceScore = baseConfidence(g, cfg.minCoverage);
    if (coverage < cfg.minCoverage)
        reasons.push('LOW_DATA_QUALITY');
    if (g.dataMode === 'csv_only')
        reasons.push('CSV_ONLY_PENALTY');
    if (cfg.marketId === 'OVER_05_HT') {
        const lambdaHT = resolveLambdaHT(g);
        impliedProb = impliedProbFromOdd(g.oddOver05HT);
        modelProb = lambdaHT != null ? poissonOver(lambdaHT, 0.5) : null;
        fairOdd = fairOddFromProb(modelProb);
        edgePct = pctEdge(modelProb, impliedProb);
    }
    if (cfg.marketId === 'OVER_15_FT') {
        const lambdaFT = resolveLambdaTotalFT(g);
        impliedProb = impliedProbFromOdd(g.oddOver15FT);
        modelProb = lambdaFT != null ? poissonOver(lambdaFT, 1.5) : null;
        fairOdd = fairOddFromProb(modelProb);
        edgePct = pctEdge(modelProb, impliedProb);
    }
    if (cfg.marketId === 'OVER_25_FT') {
        const lambdaFT = resolveLambdaTotalFT(g);
        impliedProb = impliedProbFromOdd(g.oddOver25FT);
        modelProb = lambdaFT != null ? poissonOver(lambdaFT, 2.5) : null;
        fairOdd = fairOddFromProb(modelProb);
        edgePct = pctEdge(modelProb, impliedProb);
    }
    if (cfg.marketId === 'BTTS_YES') {
        const lambdaHome = resolveLambdaHomeFT(g);
        const lambdaAway = resolveLambdaAwayFT(g);
        impliedProb = impliedProbFromOdd(g.oddBTTSYes);
        modelProb =
            lambdaHome != null && lambdaAway != null ? probBTTS(lambdaHome, lambdaAway) : null;
        fairOdd = fairOddFromProb(modelProb);
        edgePct = pctEdge(modelProb, impliedProb);
        const weakAttack = (lambdaHome ?? 0) < 0.8 || (lambdaAway ?? 0) < 0.8;
        if (weakAttack) {
            confidenceScore = clamp(confidenceScore - 10, 0, 100);
            reasons.push('CONFLICTING_SIGNALS');
        }
    }
    if (impliedProb == null)
        reasons.push('ODDS_UNAVAILABLE');
    if (modelProb == null)
        reasons.push('MISSING_CORE_FIELDS');
    let effectiveEdge = edgePct ?? -999;
    if (g.dataMode === 'csv_only')
        effectiveEdge -= cfg.csvOnlyPenaltyPct;
    if ((modelProb ?? 0) < cfg.minModelProb)
        reasons.push('LOW_MODEL_PROB');
    if (effectiveEdge < cfg.minEdgePct)
        reasons.push('LOW_EDGE');
    const strongPass = (modelProb ?? 0) >= cfg.minModelProb &&
        effectiveEdge >= cfg.minEdgePct &&
        coverage >= cfg.minCoverage &&
        impliedProb != null;
    const reviewPass = (modelProb ?? 0) >= cfg.minModelProb &&
        effectiveEdge >= cfg.minEdgePct - cfg.reviewEdgeBufferPct &&
        coverage >= Math.max(0.60, cfg.minCoverage - 0.08) &&
        impliedProb != null;
    if (strongPass)
        reasons.push('PASS_STRONG');
    else if (reviewPass)
        reasons.push('PASS_BASELINE');
    const status = strongPass
        ? 'APPROVED'
        : reviewPass
            ? 'REVIEW'
            : 'BLOCKED';
    return {
        marketId: cfg.marketId,
        status,
        modelProb,
        impliedProb,
        edgePct,
        confidenceScore,
        fairOdd,
        reasons,
        debug: {
            coverage,
            dataMode: g.dataMode,
            effectiveEdge,
            minModelProb: cfg.minModelProb,
            minEdgePct: cfg.minEdgePct,
        },
    };
}
function evaluateAllMarkets(g) {
    const order = ['OVER_15_FT', 'OVER_25_FT', 'BTTS_YES', 'OVER_05_HT'];
    return order.map((marketId) => evaluateTrigger(g, exports.TRIGGER_CONFIGS[marketId]));
}
