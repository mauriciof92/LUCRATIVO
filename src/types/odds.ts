// ─────────────────────────────────────────
//   ODDS RESOLUTION INTERFACE
//   Separar odd real de odd mínima para EV
//─────────────────────────────────────────

export interface OddsResolution {
  // Odd REAL do mercado (casa de apostas)
  // Fonte: CSV (6 mercados) ou API-Football (cantos/chutes/gols)
  // null = não temos a odd real deste mercado
  marketOdd: number | null

  // Odd MÍNIMA para ter EV positivo (calculada pelo engine)
  // Sempre existe. É o limiar: "só aposte se encontrar >= este valor"
  minOdd: number

  // Source: de onde veio a odd real
  source: 'csv' | 'api-real' | 'estimated' | 'api-rejected' | 'csv-rejected' | 'estimated-rejected' | null
}
