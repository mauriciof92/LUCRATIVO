// src/lib/trigger-map.ts

export type TriggerFn = (g: Record<string, any>) => boolean;

// 🆕 Importar novo motor Poisson
import { evaluateAllMarkets, TriggerEval, TriggerStatus } from './trigger-engine';
import { gameToMatchInput } from './trigger-adapter';

// Feature flag para alternar entre sistemas (default: false para segurança)
const USE_NEW_TRIGGER_ENGINE = true;

// 🆕 Mapeamento MercadoId → Nome Legado
const MARKET_ID_TO_LEGACY: Record<string, string> = {
  'OVER_05_HT': 'Over 0.5 Gols HT',
  'OVER_15_FT': 'Over 1.5 FT',
  'OVER_25_FT': 'Over 2.5 FT',
  'BTTS_YES': 'Ambas Marcam Sim',
  'UNDER_25_FT': 'Under 2.5 FT',
  'CORNERS_FT': 'Over 8.5 Cantos FT',
  'SHOTS_HT': 'Finalizações HT',
};

export const TRIGGER_MAP: Record<string, TriggerFn> = {

  // ── GOLS HT ──────────────────────────────────────────────
  'Over 0.5 Gols HT': (g) => {
    const afH = Number(g.afH ?? 0);
    const afA = Number(g.afA ?? 0);
    const isFavHome = afH >= afA;
    const pct = isFavHome
      ? Number(g.gol05HTH ?? 0)
      : Number(g.gol05HTA ?? 0);
    return pct >= 65;
  },

  'Over 1.5 Gols HT': (g) => {
    const afH = Number(g.afH ?? 0);
    const afA = Number(g.afA ?? 0);
    const isFavHome = afH >= afA;
    const golsHT = isFavHome
      ? Number(g.golsHTH ?? 0)
      : Number(g.golsHTA ?? 0);
    return golsHT >= 1.2 && Number(g.exG ?? 0) >= 3.5;
  },

  // ── GOLS FT ──────────────────────────────────────────────
  'Over 1.5 FT': (g) =>
    Number(g.exG ?? 0) >= 2.5,

  'Over 2.5 FT': (g) =>
    Number(g.exG ?? 0) >= 3.2 &&
    Math.max(Number(g.perc25H ?? 0), Number(g.perc25A ?? 0)) >= 50,

  'Under 2.5 FT': (g) => {
    // xG alto mas concentrado em um time (favorito domina, visitante defende)
    const afH = Number(g.afH ?? 0);
    const afA = Number(g.afA ?? 0);
    const diffAF = Math.abs(afH - afA);
    const pctFav = afH >= afA
      ? Number(g.gol05HTH ?? 0)
      : Number(g.gol05HTA ?? 0);
    return diffAF >= 20 && pctFav >= 75 && Number(g.exG ?? 0) <= 3.5;
  },

  // ── BTTS ─────────────────────────────────────────────────
  'Ambas Marcam Sim': (g) => {
    // Prioridade 1: % histórico real de ambas marcarem
    const pctH = Number(g.percBTTSH ?? 0);
    const pctA = Number(g.percBTTSA ?? 0);
    if (pctH >= 50 && pctA >= 45) return true;
    // Prioridade 2: média de gols marcados + sofridos cruzados
    const golsH   = Number(g.golsH ?? g.golsHTH ?? 0);
    const golsA   = Number(g.golsA ?? g.golsHTA ?? 0);
    const sofH    = Number(g.golsSofH ?? 0);
    const sofA    = Number(g.golsSofA ?? 0);
    return golsH >= 0.9 && golsA >= 0.9 && sofH >= 0.8 && sofA >= 0.8;
  },

  // ── CANTOS FT ────────────────────────────────────────────
  'Over 8.5 Cantos FT': (g) =>
    Number(g.exC ?? 0) >= 9.5 ||
    (Number(g.cantFTH ?? 0) + Number(g.cantFTA ?? 0)) >= 10.0,

  'Over 9.5 Cantos FT': (g) =>
    Number(g.exC ?? 0) >= 11.0 ||
    (Number(g.cantFTH ?? 0) + Number(g.cantFTA ?? 0)) >= 11.5,

  'Over 10.5 Cantos FT': (g) =>
    Number(g.exC ?? 0) >= 12.5,

  // ── CANTOS HT ────────────────────────────────────────────
  'Over 3.5 Cantos HT': (g) => {
    const totalHT = Number(g.cantHTH ?? 0) + Number(g.cantHTA ?? 0);
    const pct4    = Math.max(Number(g.perc4CantHTH ?? 0), Number(g.perc4CantHTA ?? 0));
    return totalHT >= 6.5 || pct4 >= 55;
  },

  'Over 4.5 Cantos HT': (g) => {
    const totalHT = Number(g.cantHTH ?? 0) + Number(g.cantHTA ?? 0);
    const pct5    = Math.max(Number(g.perc5CantHTH ?? 0), Number(g.perc5CantHTA ?? 0));
    return totalHT >= 8.0 || pct5 >= 50;
  },

  // ── CHUTES / FINALIZAÇÕES HT ─────────────────────────────
  'Finalizações HT': (g) => {
    const afH = Number(g.afH ?? 0);
    const afA = Number(g.afA ?? 0);
    const chFav = afH >= afA ? Number(g.chHTH ?? 0) : Number(g.chHTA ?? 0);
    const asFav = afH >= afA ? Number(g.asPrecisaoH ?? 0)   : Number(g.asPrecisaoA ?? 0);
    // Volume de chutes alto E precisão aceitável
    return chFav >= 5.5 && asFav >= 35;
  },

  // ── ESTRATÉGIAS DE CANTO POR JANELA (NOVAS) ──────────────
  'Canto Início HT': (g) => {
    // Time domina abertura dos primeiros 10 minutos
    const cant010 = Number(g.cant010H ?? 0) + Number(g.cant010A ?? 0);
    return cant010 >= 2.0;
  },

  'Canto Pressão Final HT': (g) => {
    // Pressão nos últimos minutos do primeiro tempo (37-HT)
    const cant37 = Number(g.cantos37HTH ?? 0) + Number(g.cantos37HTA ?? 0);
    return cant37 >= 1.5;
  },

  // ── FILTRO DE CONSISTÊNCIA (não é mercado, é validador) ──
  // Use como filtro adicional antes de aprovar um mercado
  '__consistente': (g) => {
    // CV baixo = time consistente, não oscila
    const cvGolsHT = Math.min(
      Number(g.cvGolsHT ?? 100),
      Number(g.cvGolsHT ?? 100)
    );
    return cvGolsHT <= 55;
  },

};

// 🆕 Função wrapper que usa novo motor Poisson com fallback para sistema antigo
function getEligibleMarketsNew(game: Record<string, any>): string[] {
  try {
    // Converter jogo para MatchInput
    const matchInput = gameToMatchInput(game);
    
    // Avaliar todos os mercados com novo motor
    const evaluations: TriggerEval[] = evaluateAllMarkets(matchInput);
    
    // Filtrar mercados aprovados ou em review
    const approvedMarkets = evaluations
      .filter(evaluation => evaluation.status === 'APPROVED' || evaluation.status === 'REVIEW')
      .map(evaluation => MARKET_ID_TO_LEGACY[evaluation.marketId])
      .filter(Boolean);

    // Log detalhado para debugging
    const approvedDetails = evaluations
      .filter(evaluation => evaluation.status === 'APPROVED' || evaluation.status === 'REVIEW')
      .map(evaluation => {
        const legacyName = MARKET_ID_TO_LEGACY[evaluation.marketId];
        const statusIcon = evaluation.status === 'APPROVED' ? '✅' : '⚠️';
        const edgeInfo = evaluation.edgePct ? `+${evaluation.edgePct.toFixed(1)}%` : 'N/A';
        const confInfo = `${evaluation.confidenceScore}%`;
        return `${statusIcon} ${legacyName} (edge: ${edgeInfo}, conf: ${confInfo})`;
      });

    if (approvedDetails.length > 0) {
      console.log(`[POISSON-ENGINE] ${game.match ?? game.home}: ${approvedDetails.length} mercados → ${approvedDetails.join(' | ')}`);
    }

    return approvedMarkets;

  } catch (error) {
    console.error(`[POISSON-ENGINE] Erro ao avaliar jogo ${game.match ?? game.home}:`, error);
    // Fallback para sistema antigo em caso de erro
    return getEligibleMarketsLegacy(game);
  }
}

// 🆕 Função legado original (mantida como fallback)
function getEligibleMarketsLegacy(game: Record<string, any>): string[] {
  const markets = Object.entries(TRIGGER_MAP)
    .filter(([label, fn]) => !label.startsWith('__') && fn(game))
    .map(([label]) => label);
  
  return markets;
}

// 🆕 Função principal com feature flag
export function getEligibleMarkets(game: Record<string, any>): string[] {
  if (USE_NEW_TRIGGER_ENGINE) {
    return getEligibleMarketsNew(game);
  } else {
    return getEligibleMarketsLegacy(game);
  }
}

// 🆕 Exportar função para ativar/desativar novo motor (para testes)
export function setNewTriggerEngine(enabled: boolean): void {
  // Em runtime, isso não funcionará mas serve para documentar
  // Para produção, alterar a constante USE_NEW_TRIGGER_ENGINE
  console.log(`[TRIGGER-ENGINE] Novo motor ${enabled ? 'ATIVADO' : 'DESATIVADO'} (requer restart)`);
}

// Verifica se um mercado específico é elegível
export function isMarketEligible(
  game: Record<string, any>,
  marketLabel: string
): boolean {
  const fn = TRIGGER_MAP[marketLabel];
  if (!fn) return false;
  return fn(game);
}
