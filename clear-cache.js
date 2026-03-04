// Script de limpeza imediata do localStorage
// Execute no console do navegador para resolver o problema agora

console.log('🧹 LIMPANDO CACHE LOCAL...');

// Limpar todos os caches relacionados
const keysToRemove = [
  'lucrativo-processed-games',
  'lucrativo-last-csv',
  'lucrativo-cache-timestamp',
  'lucrativo-backtest-data',
  'backtest-manual-inputs'
];

let removedCount = 0;
keysToRemove.forEach(key => {
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    console.log(`✅ Removido: ${key}`);
    removedCount++;
  } else {
    console.log(`⚪ Não encontrado: ${key}`);
  }
});

console.log(`\n🏁 LIMPEZA CONCLUÍDA: ${removedCount} chaves removidas`);
console.log('📡 Recarregue a página (F5 ou Ctrl+R) para buscar dados limpos do Supabase');
console.log('🔄 Na próxima importação de CSV, os lotes passarão sem duplicatas');
