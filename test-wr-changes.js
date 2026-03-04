// Script de teste para validar as mudanças de WR e não resolvidos
// Execute no console do navegador para testar

console.log('🧪 TESTE DAS MUDANÇAS DE WR E NÃO RESOLVIDOS');

// 1. Verificar se os dados existem no localStorage
const stored = localStorage.getItem('lucrativo-processed-games');
if (!stored) {
  console.error('❌ Nenhum dado encontrado no localStorage. Faça upload de um CSV primeiro.');
} else {
  console.log('✅ Dados encontrados no localStorage');
  
  // 2. Parse dos dados
  let results;
  try {
    results = JSON.parse(stored);
    console.log(`📊 Total de jogos: ${results.length}`);
  } catch (e) {
    console.error('❌ Erro ao parsear dados:', e);
    return;
  }

  // 3. Aplicar a nova lógica de filtragem
  const confirmed = results.filter(r => 
    r.mainMarket.result === "win" || r.mainMarket.result === "lose"
  );
  const unresolved = results.filter(r => 
    r.mainMarket.result === "avg" || r.mainMarket.result === "no-odd"
  );

  // 4. Calcular estatísticas
  const wins = confirmed.filter(r => r.mainMarket.result === "win").length;
  const losses = confirmed.filter(r => r.mainMarket.result === "lose").length;
  const hitRate = confirmed.length > 0 ? (wins / confirmed.length * 100) : 0;
  const avgCount = unresolved.filter(r => r.mainMarket.result === 'avg').length;
  const noOddCount = unresolved.filter(r => r.mainMarket.result === 'no-odd').length;

  // 5. Exibir resultados
  console.log('\n📈 DISTRIBUIÇÃO COMPLETA:');
  console.log(`• Total de jogos: ${results.length}`);
  console.log(`• Confirmados (win/lose): ${confirmed.length}`);
  console.log(`• Não resolvidos (avg/no-odd): ${unresolved.length}`);
  console.log(`  └─ AVG: ${avgCount}`);
  console.log(`  └─ NO-ODD: ${noOddCount}`);

  console.log('\n🎯 ESTATÍSTICAS DE WR:');
  console.log(`• Wins: ${wins}`);
  console.log(`• Losses: ${losses}`);
  console.log(`• Hit Rate: ${hitRate.toFixed(1)}%`);
  console.log(`• Denominador: ${confirmed.length} (apenas confirmados)`);

  // 6. Verificar se a soma bate
  const totalCalculado = confirmed.length + unresolved.length;
  console.log('\n🔍 VALIDAÇÃO:');
  console.log(`• Soma calculada: ${totalCalculado}`);
  console.log(`• Total original: ${results.length}`);
  console.log(`✅ Soma bate? ${totalCalculado === results.length ? 'SIM' : 'NÃO'}`);

  // 7. Simular exibição do Dashboard
  console.log('\n📱 COMO APARECERÁ NO DASHBOARD:');
  console.log(`Hit Rate: ${hitRate.toFixed(1)}%`);
  console.log(`Subtítulo: ${wins}W / ${losses}L de ${confirmed.length} apostas`);
  
  if (unresolved.length > 0) {
    console.log(`KPI Não Resolvidos: ${unresolved.length}`);
    console.log(`Subtítulo: ${avgCount} avg + ${noOddCount} no-odd`);
  }

  // 8. Detalhar alguns exemplos de cada tipo
  console.log('\n🔍 EXEMPLOS:');
  const winExample = confirmed.find(r => r.mainMarket.result === 'win');
  const loseExample = confirmed.find(r => r.mainMarket.result === 'lose');
  const avgExample = unresolved.find(r => r.mainMarket.result === 'avg');
  const noOddExample = unresolved.find(r => r.mainMarket.result === 'no-odd');

  console.log('• WIN example:', winExample ? `${winExample.match} - ${winExample.mainMarket.label}` : 'Nenhum');
  console.log('• LOSE example:', loseExample ? `${loseExample.match} - ${loseExample.mainMarket.label}` : 'Nenhum');
  console.log('• AVG example:', avgExample ? `${avgExample.match} - ${avgExample.mainMarket.label}` : 'Nenhum');
  console.log('• NO-ODD example:', noOddExample ? `${noOddExample.match} - ${noOddExample.mainMarket.label}` : 'Nenhum');
}

console.log('\n🏁 FIM DO TESTE');
