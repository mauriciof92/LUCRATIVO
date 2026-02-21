/**
 * SCORE DE ELITE — BLITZ HT
 *
 * Retorna um índice de 0-100 representando a probabilidade
 * de o favorito dominar o primeiro tempo com alto volume
 * de finalizações e cantos.
 *
 * PESOS baseados em correlação estatística com win:
 *   chFavGol:    0.28  (preditor mais forte — histórico de chutes)
 *   afFav:       0.22  (força de ataque atual)
 *   gol05HTFav:  0.18  (consistência de gols HT)
 *   afDiff:      0.15  (superioridade relativa)
 *   exG:         0.10  (expectativa de gols — modelo físico)
 *   cv_penalty:  0.07  (penalidade por inconsistência)
 */

export interface BlitzFeatures {
  chFavGol: number;       // Média chutes no alvo HT do favorito (histórico)
  chFavTot: number;       // Total chutes HT favorito (no alvo + fora)
  afFav: number;          // % Força de ataque favorito (0-100)
  afDiff: number;         // Diferença de força ataque fav - under
  exG: number;            // Expected goals (modelo físico)
  gol05HTFav: number;     // % jogos com Over 0.5 gols HT pelo favorito
  cvGolsHT: number;       // Coeficiente de variação de gols HT (0-1)
  cantFavHT: number;      // Média cantos HT favorito
  pontosPorJogo: number;  // Pontos por jogo favorito (0-3)
  shotsPrecision: number; // % Precisão nos chutes (on target / total)
}

export interface BlitzScore {
  score: number;           // 0-100
  tier: "elite" | "forte" | "moderado" | "fraco";
  components: {
    historicalShots: number;   // Contribuição chFavGol
    attackStrength: number;    // Contribuição afFav + afDiff
    htConsistency: number;     // Contribuição gol05HTFav
    physicalModel: number;     // Contribuição exG
    variancePenalty: number;   // Penalidade cvGolsHT (negativo)
  };
  recommendation: string;
  marketSuggestion: string;   // Qual linha sugerir (Over 3.5, 4.5, 5.5)
}

export function calculateBlitzScore(f: BlitzFeatures): BlitzScore {

  // ── 1. COMPONENTE: Histórico de Chutes (peso 0.28) ─────────
  const historicalShots = Math.min(1,
    f.chFavGol >= 8 ? 1.00 :
    f.chFavGol >= 7 ? 0.90 :
    f.chFavGol >= 6 ? 0.78 :
    f.chFavGol >= 5 ? 0.62 :
    f.chFavGol >= 4 ? 0.45 :
    f.chFavGol >= 3 ? 0.28 :
    0.10
  ) * 0.28;

  // ── 2. COMPONENTE: Força de Ataque (peso 0.22) ─────────────
  const afNorm = Math.min(1, f.afFav / 100);
  const diffBonus = Math.min(0.15, f.afDiff / 200);
  const attackStrength = (afNorm + diffBonus) * 0.22;

  // ── 3. COMPONENTE: Consistência HT (peso 0.18) ─────────────
  const htConsistency = Math.min(1, f.gol05HTFav / 100) * 0.18;

  // ── 4. COMPONENTE: Modelo Físico exG (peso 0.10) ────────────
  const physicalModel = Math.min(1,
    f.exG >= 2.5 ? 1.00 :
    f.exG >= 2.0 ? 0.85 :
    f.exG >= 1.5 ? 0.65 :
    f.exG >= 1.0 ? 0.40 :
    0.20
  ) * 0.10;

  // ── 5. BÔNUS: Cantos HT (peso 0.07) ─────────────────────────
  const cornerBonus = Math.min(1,
    f.cantFavHT >= 5 ? 1.00 :
    f.cantFavHT >= 4 ? 0.80 :
    f.cantFavHT >= 3 ? 0.55 :
    f.cantFavHT >= 2 ? 0.30 :
    0.10
  ) * 0.07;

  // ── 6. BÔNUS: Precisão nos Chutes (peso 0.08) ───────────────
  const precisionBonus = Math.min(1, f.shotsPrecision / 100) * 0.08;

  // ── 7. PENALIDADE: Coeficiente de Variação (peso -0.07) ──────
  const variancePenalty = Math.min(0.07,
    f.cvGolsHT > 0.7 ? 0.07 :
    f.cvGolsHT > 0.5 ? 0.04 :
    f.cvGolsHT > 0.3 ? 0.02 :
    0.00
  );

  // ── SCORE FINAL ───────────────────────────────────────────────
  const rawScore =
    historicalShots +
    attackStrength +
    htConsistency +
    physicalModel +
    cornerBonus +
    precisionBonus -
    variancePenalty;

  const score = Math.round(Math.min(100, Math.max(0, rawScore * 100)));

  // ── TIER ─────────────────────────────────────────────────────
  const tier: BlitzScore["tier"] =
    score >= 80 ? "elite" :
    score >= 65 ? "forte" :
    score >= 50 ? "moderado" : "fraco";

  // ── LINHA SUGERIDA ────────────────────────────────────────────
  const marketSuggestion =
    f.chFavGol >= 7 && score >= 80 ? "Finalizações HT Over 5.5 ⭐" :
    f.chFavGol >= 6 && score >= 65 ? "Finalizações HT Over 4.5" :
    f.chFavGol >= 4 && score >= 50 ? "Finalizações HT Over 3.5" :
    "Sem sugestão HT — verificar outro mercado";

  // ── RECOMENDAÇÃO ─────────────────────────────────────────────
  const recommendation =
    tier === "elite"    ? "🔥 Setup BLITZ — confiança máxima. Apostar com stake elevado." :
    tier === "forte"    ? "✅ Setup sólido. Incluir no combo com cautela." :
    tier === "moderado" ? "📊 Setup aceitável. Apenas como perna de apoio." :
                          "⚠️ Não apostar. Score insuficiente.";

  return {
    score,
    tier,
    components: {
      historicalShots: Math.round(historicalShots * 100),
      attackStrength:  Math.round(attackStrength * 100),
      htConsistency:   Math.round(htConsistency * 100),
      physicalModel:   Math.round(physicalModel * 100),
      variancePenalty: Math.round(variancePenalty * 100),
    },
    recommendation,
    marketSuggestion,
  };
}

/**
 * Versão simplificada para uso com dados do BetResult (favorito object)
 * Preenche campos ausentes com 0 para não quebrar o cálculo.
 */
export function calculateBlitzScoreFromFavorito(favorito: any, exG = 0): BlitzScore {
  return calculateBlitzScore({
    chFavGol:       Number(favorito?.chFavGol ?? 0),
    chFavTot:       Number(favorito?.chFavTot ?? 0),
    afFav:          Number(favorito?.afFav ?? 0),
    afDiff:         Number(favorito?.afDiff ?? 0),
    exG:            Number(exG ?? 0),
    gol05HTFav:     Number(favorito?.gol05HTFav ?? 0),
    cvGolsHT:       0,
    cantFavHT:      Number(favorito?.cantFavHT ?? 0),
    pontosPorJogo:  0,
    shotsPrecision: 0,
  });
}
