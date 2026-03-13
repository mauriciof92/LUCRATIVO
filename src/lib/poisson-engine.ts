// Motor Matemático Poisson Calibrado para Laboratório de Múltiplas
// Implementa Força Relativa + Expectativa de Gols + Ajuste Dixon-Coles

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

    const match = getCalibratedLambdas(row);

    // LOG do primeiro jogo para diagnóstico
    if (cssCandidates + x12Candidates === 0) {
      console.log('[ENGINE-DEBUG]', match.homeTeam,
        '| lambdaHome:', match.lambdaHome.toFixed(2),
        '| lambdaAway:', match.lambdaAway.toFixed(2),
        '| lambdaTotal:', match.lambdaTotal.toFixed(2)
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

    if (max1X2 >= 0.40 && max1X2 <= 0.85) {
      x12Candidates++;
      const sel = max1X2 === prob1 ? 'Casa' : max1X2 === prob2 ? 'Fora' : 'Empate';
      sweetSpot1X2.push({
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        baseSelection: sel,
        probBase: max1X2,
        probEmpate: probX,
        fairOddBase: 1 / max1X2
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
