// Motor Matemático Poisson Calibrado para Laboratório de Múltiplas
// Implementa Força Relativa + Expectativa de Gols + Ajuste Dixon-Coles

// Função auxiliar global para parsing de colunas com pipe
const parseSplit = (col: string | undefined, index: number): number => {
  if (!col) return 0;
  const separators = [' | ', '|'];
  for (const sep of separators) {
    if (col.includes(sep)) {
      const parts = col.split(sep);
      const val = parts[index]?.replace(',', '.').trim();
      return parseFloat(val ?? '0') || 0;
    }
  }
  return parseFloat(col.replace(',', '.').trim()) || 0;
};

// FASE 1: O Freio de Mão (Penalizações por falta de dado)
function calculateDataPenalty(csvRow: string[]): number {
  // Índices mapeados com segurança do CSV PackBall atual
  const exG = parseFloat(csvRow[25]?.replace(',', '.') || '0');
  const exC = parseFloat(csvRow[30]?.replace(',', '.') || '0'); // Cantos Global
  
  const hasPipe = (col: string) => col && col.includes('|');
  const hasGols = hasPipe(csvRow[15]); // Média gols H|A
  const hasDefesa = hasPipe(csvRow[30]); // Média gols sofridos H|A
  
  let penalty = 0;
  if (exG === 0 || isNaN(exG)) penalty -= 0.15;
  if (!hasGols || !hasDefesa) penalty -= 0.10;
  if (exC === 0 || isNaN(exC)) penalty -= 0.05;
  
  return penalty;
}

const factorial = (n: number): number => {
  if (n <= 1) return 1;
  let acc = 1;
  for (let i = 2; i <= n; i++) acc *= i;
  return acc;
};

export function getCalibratedLambdas(csvRow: string[]) {
  // CORREÇÃO 1 — LOG CIRÚRGICO
  if (csvRow[5]) {
    console.log('[LAMBDA-DEBUG]', csvRow[5], '|',
      'col15:', csvRow[15],
      'col30:', csvRow[30],
      'col25:', csvRow[25]
    );
  }

  const homeTeam = csvRow[5];  // Índice correto do engine.js
  const awayTeam = csvRow[8];  // Índice correto do engine.js
  
  // CORREÇÃO 2 — PARSING ROBUSTO
  const safeNum = (val: string | undefined): number => {
    if (!val) return 0;
    return parseFloat(val.replace(',', '.').trim()) || 0;
  };

  const goalsScoredHome = parseSplit(csvRow[15], 0); // Média Gols Feitos Casa|Fora
  const goalsScoredAway = parseSplit(csvRow[15], 1);
  const goalsConcededHome = parseSplit(csvRow[30], 0); // Média Gols Sofridos Casa|Fora
  const goalsConcededAway = parseSplit(csvRow[30], 1);
  const exG = safeNum(csvRow[25]); // EXG - Expectativa de Gols

  const LEAGUE_AVG = 1.35;

  // Força Relativa de Ataque e Defesa
  const attackHome = goalsScoredHome / LEAGUE_AVG;
  const defenseAway = goalsConcededAway / LEAGUE_AVG;
  const attackAway = goalsScoredAway / LEAGUE_AVG;
  const defenseHome = goalsConcededHome / LEAGUE_AVG;

  let rawHome = LEAGUE_AVG * attackHome * defenseAway;
  let rawAway = LEAGUE_AVG * attackAway * defenseHome;

  // CORREÇÃO 3 — FALLBACK COMPLETO COM exG
  // Se o parsing das colunas falhou (valores zerados), usa exG como base
  const homeInvalid = goalsScoredHome === 0 || goalsConcededAway === 0;
  const awayInvalid = goalsScoredAway === 0 || goalsConcededHome === 0;

  if (homeInvalid || awayInvalid) {
    // Fallback: distribui o exG com leve vantagem para o mandante
    rawHome = exG > 0 ? exG * 0.55 : 1.35;
    rawAway = exG > 0 ? exG * 0.45 : 1.10;
  }

  // Ajuste fino: Mescla Força Relativa (70%) com Expectativa de Gols do Modelo Base (30%)
  const totalRaw = rawHome + rawAway;
  if (exG > 0 && totalRaw > 0) {
    const exGHome = exG * (rawHome / totalRaw);
    const exGAway = exG * (rawAway / totalRaw);
    rawHome = (rawHome * 0.7) + (exGHome * 0.3);
    rawAway = (rawAway * 0.7) + (exGAway * 0.3);
  }

  return { 
    homeTeam, 
    awayTeam, 
    lambdaHome: rawHome, 
    lambdaAway: rawAway, 
    lambdaTotal: rawHome + rawAway 
  };
}

// FASE 2: A Narrativa por Perfis (O Gatilho Oculto)
function getFavoritoSimplificado(csvRow: string[]) {
  // Usando a mesma função safeNum e parseSplit que já existem no arquivo
  const goalsScoredHome = parseSplit(csvRow[15], 0);
  const goalsScoredAway = parseSplit(csvRow[15], 1);
  const goalsConcededHome = parseSplit(csvRow[30], 0);
  const goalsConcededAway = parseSplit(csvRow[30], 1);
  
  // Transformando em escala de Força (AF) de 0 a 100 baseada na média da liga
  const afH = (goalsScoredHome / 1.35) * 50; 
  const afA = (goalsScoredAway / 1.35) * 50;
  const dfH = (goalsConcededHome / 1.35) * 50;
  const dfA = (goalsConcededAway / 1.35) * 50;

  const afDiff = Math.abs(afH - afA);
  const afFav = Math.max(afH, afA);
  const afUnder = Math.min(afH, afA);
  const dfUnder = afH >= afA ? dfA : dfH;

  // Chutes no gol do favorito (Índice 38 do CSV)
  const chFavGol = parseSplit(csvRow[38], afH >= afA ? 0 : 1);

  return { afDiff, afFav, afUnder, dfUnder, chFavGol, isHomeFav: afH >= afA };
}

export function classifyProfile(csvRow: string[]) {
  const fav = getFavoritoSimplificado(csvRow);
  const exG = parseFloat(csvRow[25]?.replace(',', '.') || '0');
  const exC = parseFloat(csvRow[26]?.replace(',', '.') || '0');
  
  // 1. Dominância Absoluta: Um time amassa o outro (Fav Vence + Gols)
  if (fav.afDiff >= 35 && fav.afFav >= 60 && exG >= 2.8) return "dominant";
  
  // 2. Amassa no 1º Tempo: Favorito muito forte e chuta muito (Chutes HT Fav)
  if (fav.afDiff >= 20 && fav.chFavGol >= 4 && exG >= 2.5) return "chutes_ht_fav";
  
  // 3. TIROTEIO ABERTO (NOVO!): Times se equivalem, mas com MUITA expectativa de gol.
  // Cenário perfeito para Over Finalizações do time da casa (que joga solto) ou BTTS
  if (exG >= 3.3 && fav.afDiff <= 20) return "shootout_btts"; 
  
  // 4. Jogo de Escanteios: Foco nas bandeirinhas
  if (exC >= 10.5) return "corner_dominant";
  
  // 5. Alta Ofensividade com leve favoritismo
  if (exG >= 3.0 && fav.afDiff <= 25 && fav.afUnder >= 35) return "high_offense_balanced";
  
  // 6. Equilíbrio Padrão para Ambas Marcam
  if (fav.afDiff <= 15 && exG >= 2.8 && fav.afUnder >= 40) return "balanced_btts";
  
  // 7. Jogo Travado (Under / Sem valor)
  if (exG < 2.4 && fav.afDiff <= 15) return "low_goals";
  
  return "generic";
}

// FASE 3: A Probabilidade Dinâmica (O Edge da Casa)
export function calculateDynamicProbability(csvRow: string[], marketType: 'fav' | 'btts' | 'over15', poissonProb: number) {
  const profile = classifyProfile(csvRow);
  const fav = getFavoritoSimplificado(csvRow);
  const exG = parseFloat(csvRow[25]?.replace(',', '.') || '0');
  const penalty = calculateDataPenalty(csvRow);
  
  // Base segura: mistura o Poisson matemático com o peso do motor
  let ourProb = (poissonProb * 0.70) + (0.30); 
  
  const marketAdjustments = {
    'over15': () => {
      const xgProb = Math.min(exG / 3.5, 0.85); // ExG alto empurra prob pra cima
      return (ourProb * 0.5) + (xgProb * 0.5);
    },
    'btts': () => {
      const balanceBonus = (fav.afDiff <= 15 && exG >= 2.8) ? 0.15 : 0;
      return ourProb + balanceBonus;
    },
    'fav': () => {
      // Se a diferença de força for imensa, estica a probabilidade de vitória
      const winProb = Math.min(fav.afDiff / 60, 0.90);
      return (ourProb * 0.6) + (winProb * 0.4);
    }
  };
  
  if (marketAdjustments[marketType]) {
    ourProb = marketAdjustments[marketType]();
  }
  
  const profileBonus = {
    dominant: 0.08,
    chutes_ht_fav: 0.06,
    balanced_btts: 0.05,
    high_offense_balanced: 0.05,
    corner_dominant: 0,
    low_goals: -0.05,
    generic: 0
  };
  
  // Applica bônus de narrativa e subtrai lixo de dados
  ourProb = ourProb + (profileBonus[profile as keyof typeof profileBonus] || 0) + penalty;
  
  // Trava de segurança (nunca dar certeza absoluta nem impossibilidade)
  return Math.max(0.10, Math.min(0.92, ourProb));
}

export function getDixonColesScores(lambdaHome: number, lambdaAway: number, rho: number = -0.15) {
  let prob1 = 0, probX = 0, prob2 = 0;
  const scores = [];

  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      let probCell = ((Math.exp(-lambdaHome) * Math.pow(lambdaHome, i)) / factorial(i)) *
                     ((Math.exp(-lambdaAway) * Math.pow(lambdaAway, j)) / factorial(j));

      // Ajuste Dixon-Coles para empates e placares magros
      if (i === 0 && j === 0) probCell *= (1 - (lambdaHome * lambdaAway * rho));
      else if (i === 0 && j === 1) probCell *= (1 + (lambdaHome * rho));
      else if (i === 1 && j === 0) probCell *= (1 + (lambdaAway * rho));
      else if (i === 1 && j === 1) probCell *= (1 - rho);

      probCell = Math.max(0, probCell);

      if (i > j) prob1 += probCell;
      else if (i === j) probX += probCell;
      else prob2 += probCell;

      scores.push({ score: `${i}-${j}`, prob: probCell });
    }
  }

  scores.sort((a, b) => b.prob - a.prob);
  return { odds1X2: { prob1, probX, prob2 }, topScore: scores };
}

export function generateSmartMultiples(csvData: string[][]) {
  const sweetSpot1X2 = [];
  const sweetSpotCS = [];

  // BUG 3 — GERADOR PRODUZ ZERO RESULTADOS
  let cssCandidates = 0;
  let x12Candidates = 0;

  for (const row of csvData) {
    // Pula header e linhas inválidas
    if (!row[5] || row[5] === 'Home Team' || row[5] === 'Country') continue;

    // FASE 2: Classificar perfil e pular jogos genéricos (O Gatilho Oculto)
    const gameProfile = classifyProfile(row);
    if (gameProfile === "generic") continue;

    // FASE 1: Calcular penalização por dados ausentes (O Freio de Mão)
    const dataPenalty = calculateDataPenalty(row);
    if (dataPenalty < -0.20) continue; // Pula jogos com dados muito ruins

    const match = getCalibratedLambdas(row);

    // LOG do primeiro jogo para diagnóstico
    if (cssCandidates + x12Candidates === 0) {
      console.log('[ENGINE-DEBUG]', match.homeTeam,
        '| lambdaHome:', match.lambdaHome.toFixed(2),
        '| lambdaAway:', match.lambdaAway.toFixed(2),
        '| lambdaTotal:', match.lambdaTotal.toFixed(2),
        '| profile:', gameProfile,
        '| penalty:', dataPenalty.toFixed(2)
      );
    }

    const poisson = getDixonColesScores(match.lambdaHome, match.lambdaAway);

    // FILTRO CS — ampliado e sem piso mínimo de prob para diagnóstico
    if (match.lambdaTotal >= 1.5 && match.lambdaTotal <= 4.0) {
      if (poisson.topScore && poisson.topScore[0] && poisson.topScore[0].prob >= 0.08) {
        cssCandidates++;
        sweetSpotCS.push({
          matchName: `${match.homeTeam} vs ${match.awayTeam}`,
          selection: poisson.topScore[0].score,
          prob: poisson.topScore[0].prob,
          fairOdd: 1 / poisson.topScore[0].prob
        });
      }
    }

    // FILTRO 1X2 — ampliado
    const { prob1, probX, prob2 } = poisson.odds1X2;
    const max1X2 = Math.max(prob1, probX, prob2);

    // Pula jogos onde não há narrativa clara (Freio de produção)
    if (gameProfile === "low_goals") continue;

    if (max1X2 >= 0.40 && max1X2 <= 0.85) {
      x12Candidates++;
      const sel = max1X2 === prob1 ? 'Casa' : max1X2 === prob2 ? 'Fora' : 'Empate';
      
      // Aplica a Probabilidade Dinâmica na perna favorita
      const dynamicProb = sel === 'Empate' 
        ? probX // Empate fica com o Poisson puro
        : calculateDynamicProbability(row, 'fav', max1X2);
        
      sweetSpot1X2.push({
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        baseSelection: sel,
        probBase: dynamicProb,
        probEmpate: probX,
        fairOddBase: 1 / dynamicProb,
        profile: gameProfile // Retorna para debug visual se quiser
      });
    }
  }

  console.log('[ENGINE-RESULT] CS candidates:', cssCandidates, '| 1X2 candidates:', x12Candidates);

  // Ordena Placar Exato pelas maiores probabilidades e pega a Tripla
  sweetSpotCS.sort((a, b) => b.prob - a.prob);
  const triplaCS = sweetSpotCS.slice(0, 3);

  // Ordena a Lista 1X2 dos mais prováveis (Secos) para os menos prováveis
  sweetSpot1X2.sort((a, b) => b.probBase - a.probBase);
  // Limita a nata do dia a 6 jogos
  const listaDoDia = sweetSpot1X2.slice(0, 6);

  const vars1X2 = [];
  if (listaDoDia.length >= 3) {
    // Variação 1 (A Lógica): Tudo no Favorito
    vars1X2.push(listaDoDia.map(g => ({
      matchName: g.matchName, 
      selection: g.baseSelection, 
      prob: g.probBase, 
      fairOdd: g.fairOddBase
    })));

    // Variação 2 (Proteção Leve): O último da lista vira Empate
    vars1X2.push(listaDoDia.map((g, index) => {
      if (index === listaDoDia.length - 1) return { 
        matchName: g.matchName, 
        selection: 'Empate', 
        prob: g.probEmpate, 
        fairOdd: 1 / g.probEmpate 
      };
      return { 
        matchName: g.matchName, 
        selection: g.baseSelection, 
        prob: g.probBase, 
        fairOdd: g.fairOddBase 
      };
    }));

    // Variação 3 (Proteção Dupla): Os dois últimos da lista viram Empate
    vars1X2.push(listaDoDia.map((g, index) => {
      if (index >= listaDoDia.length - 2) return { 
        matchName: g.matchName, 
        selection: 'Empate', 
        prob: g.probEmpate, 
        fairOdd: 1 / g.probEmpate 
      };
      return { 
        matchName: g.matchName, 
        selection: g.baseSelection, 
        prob: g.probBase, 
        fairOdd: g.fairOddBase 
      };
    }));
  }

  return { triplaCS, variacoes1X2: vars1X2 };
}
