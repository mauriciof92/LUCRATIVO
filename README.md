# ⚽ LUCRATIVO

Aplicação Next.js para análise de jogos de futebol com base em dados do PackBall.

## Funcionalidades

- **Upload de arquivos CSV/XLSX** do PackBall
- **Análise inteligente** com scores calibrados
- **Sugestões de mercados** baseadas em perfis de jogo
- **Interface responsiva** com design moderno
- **Debug panel** para validação de dados

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Build

```bash
npm run build
npm start
```

## Estrutura do Projeto

- `src/app/` - Páginas e layout Next.js
- `src/engine.js` - Lógica de negócio principal
- `src/app/globals.css` - Estilos globais

## Formato de Dados

A aplicação aceita arquivos CSV/XLSX com as seguintes colunas principais:

- **Coluna 5**: Home Team
- **Coluna 8**: Visitor Team  
- **Coluna 13**: Média gols H|A
- **Coluna 16**: Média escanteios FT H|A
- **Coluna 18**: Média escanteios HT H|A
- **Coluna 25**: CV gols H|A
- **Coluna 27**: ExG global
- **Coluna 30**: ExC global
- **Coluna 38**: Chutes no gol HT H|A
- **Coluna 39**: Total chutes HT H|A
- **Coluna 41**: AF força de ataque H|A
- **Coluna 44**: % Over 0.5 gols HT H|A
