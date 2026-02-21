/**
 * MAPEAMENTO PACKBALL -> SISTEMA LUCRATIVO
 *
 * Índices confirmados contra o CSV real exportado pelo Packball (base-0).
 * O CSV possui 47 colunas de dados (0–46) + colunas vazias no final.
 * NÃO usar name-matching — os cabeçalhos são genéricos e repetidos.
 *
 * Col 0-8   → Identificação do jogo
 * Col 9-14  → Odds (6 colunas)
 * Col 15-46 → Estatísticas
 */
export const CSV_MAPPER: Record<string, number> = {
  // ── Identificação ───────────────────────────────
  country:    0,
  short:      1,
  league:     2,
  hour:       3,
  status:     4,
  home:       5,   // Home Team
  resHome:    6,   // Result Home
  resAway:    7,   // Result Visitor
  away:       8,   // Visitor Team

  // ── Estatísticas (col 15-46) ─────────────────────
  golsAvgHA:              15,  // Média de gols marcados         (engine.js compat)
  gols_avg:               15,
  percMais25Gols:         16,  // % Mais de 2.5 gols

  cantFTFor:              17,  // Média de escanteios marcados   (engine.js compat)
  mediaEscanteiosMarcados:17,
  corners_avg:            17,

  mediaEscanteiosSofridos:18,  // Média de escanteios sofridos
  corners_sofridos:       18,

  cantHTFor:              19,  // Média de escanteios marcados 1° tempo
  mediaEscanteiosMarcadosHT: 19,
  corners_ht_avg:         19,

  mediaEscanteiosSofridosHT: 20, // Média de escanteios sofridos 1° tempo
  corners_sofridos_ht:    20,

  percMais4EscanteiosHT:  21,  // % Mais de 4 escanteios 1° tempo
  percMais5EscanteiosHT:  22,  // % Mais de 5 escanteios 1° tempo

  cv:                     23,  // % CV média de gols FT
  cvGolsHT:               24,  // % CV média de gols 1° tempo
  cv_gols_ht:             24,

  exG:                    25,  // EXG - expectativa de gols
  exC:                    26,  // EXC - expectativa de escanteios

  cvCantosHT:             27,  // % CV média de cantos 1° tempo
  cv_cantos_ht:           27,
  cvCantos:               28,  // % CV média de cantos FT
  cv_cantos:              28,

  mediaEscanteios21a30:   29,  // Média escanteios marcados 21-30'

  golsSofridos:           30,  // Média de gols sofridos

  shotsOnHT:              31,  // Média total de chutes marcados 1° tempo
  chutes_marcados_ht:     31,

  af:                     32,  // % AF Força de ataque
  afPercent:              32,
  af_percent:             32,

  pontosPorJogo:          33,  // Pontos por jogo

  gol05HT:                34,  // % Mais de 0.5 gols 1° tempo
  over05_ht:              34,

  golsHTMarcados:         35,  // Média de gols marcados 1° tempo
  percMediaGolsMarcadosHT:35,

  golsHTSofridos:         36,  // Média de gols sofridos 1° tempo

  btsPercent:             37,  // % Ambas marcaram
  btts_percent:           37,

  percPrimeiro5Escanteios:38,  // % Primeiro a cobrar 5 escanteios
  mediaEscanteios0a10:    39,  // Média escanteios marcados 0-10'
  mediaEscanteios11a20:   40,  // Média escanteios marcados 11-20'

  mediaChutesSofridosHT:  41,  // Média total de chutes sofridos 1° tempo

  shotsTotHT:             42,  // Média total de chutes 1° tempo
  mediaTotalChutesHT:     42,
  avg_chutes_ht:          42,

  dfDefesa:               43,  // % Força de defesa
  df:                     43,

  favoritismo:            44,  // Favoritismo - media final
  score:                  44,

  cantos_37_ht:           45,  // Média escanteios marcados 37-HT'
  as_precisao:            46,  // AS - % Precisão nos chutes (no alvo)
  appg:                   47,  // Casa | Fora - % Média de ataques perigosos por minuto
};

/**
 * Retorna o valor de uma célula pelo nome interno do campo.
 * row = array de strings da linha já splitada pelo separador.
 */
export function getCellValue(row: string[], key: string): string | null {
  const index = CSV_MAPPER[key];
  if (index !== undefined && row[index] !== undefined) {
    return row[index].trim();
  }
  return null;
}
