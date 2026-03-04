// Função utilitária para gerar ID determinístico que funciona em qualquer ambiente
export function generateDeterministicId(match: string, hour: string): string {
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
}
