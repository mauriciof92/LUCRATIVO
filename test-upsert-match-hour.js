// Script para testar mudanças de upsert com ID determinístico
// Execute no console do navegador após fazer upload de um CSV

console.log('🧪 TESTE UPSERT COM ID DETERMINÍSTICO');

// 1. Verificar se há dados no localStorage
const stored = localStorage.getItem('lucrativo-processed-games');
if (!stored) {
  console.error('❌ Nenhum dado encontrado. Faça upload de um CSV primeiro.');
} else {
  const results = JSON.parse(stored);
  console.log(`✅ Encontrados ${results.length} jogos no localStorage`);

  // 2. Função para gerar ID determinístico (igual ao código)
  const generateDeterministicId = (match, hour) => {
    const input = `${match}__${hour}`;
    
    // Node.js environment
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(input).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 36);
    }
    
    // Browser environment - com tratamento para caracteres especiais
    try {
      return btoa(unescape(encodeURIComponent(input))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 36);
    } catch (e) {
      // Fallback extremo - usar hash simples
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(36).padStart(36, '0').slice(0, 36);
    }
  };

  // 3. Verificar estrutura dos IDs
  console.log('\n🔍 VERIFICANDO ESTRUTURA DOS IDs:');
  const sampleIds = results.slice(0, 5).map(r => {
    const expectedId = generateDeterministicId(r.match, r.hour);
    return {
      match: r.match,
      hour: r.hour,
      currentId: r.id,
      expectedId: expectedId,
      isCorrect: r.id === expectedId,
      idFormat: r.id.length === 36 ? 'deterministic' : 'other'
    };
  });
  console.table(sampleIds);

  // 4. Verificar duplicatas por ID determinístico
  const idMap = new Map();
  results.forEach(r => {
    const detId = generateDeterministicId(r.match, r.hour);
    if (idMap.has(detId)) {
      idMap.get(detId).push(r);
    } else {
      idMap.set(detId, [r]);
    }
  });

  const duplicates = Array.from(idMap.entries())
    .filter(([key, games]) => games.length > 1);

  if (duplicates.length > 0) {
    console.log(`\n⚠️ ENCONTRADAS ${duplicates.length} DUPLICATAS POR ID DETERMINÍSTICO:`);
    duplicates.slice(0, 3).forEach(([key, games]) => {
      console.log(`• ${key}: ${games.length} registros`);
    });
  } else {
    console.log('\n✅ NENHUMA DUPLICATA POR ID DETERMINÍSTICO ENCONTRADA');
  }

  // 5. Simular estrutura para upsert
  console.log('\n📋 ESTRUTURA PARA UPSERT (com ID determinístico):');
  const sampleForUpsert = {
    id: generateDeterministicId(results[0]?.match, results[0]?.hour),
    match: results[0]?.match,
    hour: results[0]?.hour,
    league: results[0]?.league,
    status: results[0]?.status,
    result_home: results[0]?.resultHome,
    result_away: results[0]?.resultAway,
    profile: results[0]?.profile,
    score: results[0]?.score,
    confidence: results[0]?.confidence,
    main_market_label: results[0]?.mainMarket?.label,
    main_market_odd: results[0]?.mainMarket?.odd,
    main_market_result: results[0]?.mainMarket?.result,
    main_market_profit: results[0]?.mainMarket?.profit,
    favorito_data: JSON.stringify(results[0]?.favorito ?? {}),
    combo_data: JSON.stringify(results[0]?.combo ?? []),
    poison_data: JSON.stringify(results[0]?.poison ?? {}),
  };
  console.log('Sample para upsert:', sampleForUpsert);

  // 6. Testar geração de ID
  console.log('\n🔧 TESTE DE GERAÇÃO DE ID:');
  const testCases = [
    { match: 'Team A vs Team B', hour: '03/03/2026 20:00' },
    { match: 'Team X vs Team Y', hour: '03/03/2026 22:00' },
    { match: 'Team A vs Team B', hour: '03/03/2026 20:00' }, // duplicata
  ];
  
  testCases.forEach((tc, i) => {
    const id = generateDeterministicId(tc.match, tc.hour);
    console.log(`Caso ${i + 1}: ${tc.match} @ ${tc.hour} → ${id}`);
  });

  // 7. Verificar se Supabase está configurado
  console.log('\n🔧 CONFIGURAÇÃO SUPABASE:');
  console.log(`• URL configurada: ${!!process.env?.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`• Key configurada: ${!!process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);
  
  if (process.env?.NEXT_PUBLIC_SUPABASE_URL && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log('✅ Supabase configurado - upsert deve funcionar');
  } else {
    console.log('❌ Supabase não configurado - dados ficarão apenas no localStorage');
  }

  console.log('\n🏁 FIM DO TESTE');
}
