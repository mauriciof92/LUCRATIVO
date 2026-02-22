# Estatuto de Odds e Filtros (Motor de Risco)

## Princípio Fundamental
**A Qualidade Estatística tem precedência absoluta sobre odds engessadas.**
O sistema Lucrativo foi desenhado para identificar anomalias estatísticas, dominância de equipes e gatilhos de alto valor (Poison, Score alto). Se uma seleção é estatisticamente excelente, ela **NÃO DEVE** ser descartada cegamente apenas porque a odd correspondente não veio no CSV ou porque a odd combinada de um bilhete não atingiu um piso arbitrário global.

## 1. Fallback Universal de Odds
Quando a API ou o CSV falha em fornecer uma odd real para um mercado alternativo de alto valor (ex: *Over 5.5 Finalizações HT*):
- O sistema DEVE consultar o `getMinOddForLabel` para obter o "preço justo" daquela estatística (ex: 1.85).
- Se não houver estimativa mapeada, o sistema DEVE injetar um fallback universal conservador de **1.30** / **1.40**.
- **Objetivo:** Permitir que o motor feche o cálculo de Expected Value (EV) e sugira o bilhete/entrada para que o usuário valide a odd real na casa de apostas.

## 2. Pisos Dinâmicos de Odds (Equilíbrio de Valor - EV)
Para evitar que o sistema sugira linhas excessivamente esmagadas (onde a matemática de longo prazo é insustentável, como odds de 1.05), implementamos a arquitetura de Pisos Dinâmicos:

*   **Apostas Singulares / Panorama:** Piso mínimo de **1.40**. (Regra no `shouldSkipBet`). Entradas isoladas abaixo disso não têm EV+ suficiente.
*   **Múltiplas Tradicionais:** Piso mínimo de **1.25** por perna. O valor se constrói na multiplicação das probabilidades conjuntas.
*   **Sinfonia de Pardais (Micro-linhas / Bet Builder):** Piso mínimo de **1.15** por micro-linha. Aceita-se odds menores na construção porque o agrupamento final (SGP - Same Game Parlay) alcançará um mínimo viável (geralmente > 1.40).

## 3. Tetos e Limites
*   **Singulares (`maxOdds`):** Relaxado para **20.0** no `shouldSkipBet`. O objetivo não é barrar "zebras" estatisticamente fundamentadas, mas apenas evitar anomalias de erro de dados no CSV.
*   **Múltiplas (`minTotal` / `maxTotal`):** Limites globais restritos nos perfis de múltiplas (no `buildSGPTicket`) foram abolidos ou relaxados para garantir que bilhetes perfeitos de 3 jogos não sejam descartados por dízimos de odd.

## 4. Regra de Manutenção do `engine.js` e Analisadores
Qualquer agente ou desenvolvedor que for modificar a lógica do `src/engine.js` ou do `src/lib/pre-live-multiple-analyzer.ts` **DEVE** garantir que estas regras matemáticas de Pisos Dinâmicos não sejam substituídas por hard-blocks antigos. Nunca bloqueie uma recomendação de `Score >= 0.60` ou `Poison Trigger` por "falta de odd" sem acionar o mecanismo de Fallback.
