// Camada 2 - Objeto canônico por jogo (Mapa de Decisão v1)
// Derivado de BetResult existente, não fonte de verdade ainda

export interface DecisionGame {
  gameId: string
  context: {
    match: string
    league: string
    hour: string
    status: string
    home: string
    away: string
  }
  readings: {
    goals: number          // 0-100 (derivado de profile/score)
    btts: number           // 0-100 (derivado de profile/combo)
    corners: number        // 0-100 (placeholder)
    htPressure: number    // 0-100 (placeholder)
    shots: number          // 0-100 (placeholder)
    harmony: number        // 0-100 (placeholder)
    favoritism: number    // 0-100 (derivado de favorito)
    offensive: number      // 0-100 (derivado de score)
  }
  dominantReading: string
  mainMarket: {
    market: string
    odd: number
    edge: number
    confidence: number
  }
  secondaryMarkets: Array<{
    market: string
    odd: number
    edge: number
    reason: string
  }>
  productFit: {
    single: boolean
    multiple: boolean
    bingo: boolean
    shots: boolean
    harmony: boolean
  }
  explanationShort: string
  debugMeta: {
    originalScore: number
    originalConfidence: number
    originalProfile: string
    poison: boolean
    favorito: boolean
    mappingRules: string[]
  }
}
