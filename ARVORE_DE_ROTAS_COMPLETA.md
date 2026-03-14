# 🌳 **Árvore de Rotas Completa - Sistema Lucrativo**

## ✅ **Status: MAPEAMENTO COMPLETO DO FLUXO**

---

## 🚀 **Visão Geral da Arquitetura**

```
🏠 Home (/) → Redireciona para /panorama
📊 Dashboard (/dashboard) → Métricas e analytics
🎯 Panorama (/panorama) → View principal de jogos
🔍 Multiple Analyzer (/multiple-analyzer) → Análise detalhada
🧪 Patterns (/patterns) → Padrões e estratégias
⏪ Backtest (/backtest) → Testes históricos
🛠️ Admin (/admin) → Painel administrativo
🔬 Admin Lab (/admin/multiples-lab) → Laboratório de múltiplas
```

---

## 📋 **Fluxo Principal: Do CSV ao Panorama**

### **🚀 Etapa 1: Importação do CSV (Admin)**
```
🛠️ /admin/multiples-lab
├── 📁 Upload do CSV
├── 🔄 saveCsvToSupabase() → Salva em csv_diario
├── 📊 parseLabCSV() → Processa dados
├── 🎯 generateMultiples() → API /api/lab-multiples
└── 💾 Persistência no Supabase
```

### **🚀 Etapa 2: API de Importação**
```
🔌 /api/import (POST)
├── 📋 Recebe csvText
├── 🔄 getImportDateISOFromCSV() → YYYY-MM-DD
├── 💾 saveCsvDiario() → csv_diario (Supabase)
├── 🎯 processCSV() → Análise de jogos
├── 📊 trigger evaluations → Salva avaliações
└── ✅ Response com resultados
```

### **🚀 Etapa 3: Panorama (View Principal)**
```
🎯 /panorama
├── 📅 Date picker para seleção de data
├── 🔍 loadCsvDiario() → Busca CSV do Supabase
├── 🎯 analyzeLiveMultiplesAsync() → Análise pré-live
├── 📊 Classificação de perfis (tiroteio, dominant, etc.)
├── 🏠 Mercados principais + combos
├── 🚩 Cantos FT + odds reais
└── 🎨 Tags visuais por perfil
```

---

## 🌳 **Árvore Completa de Páginas**

### **🏠 Página Inicial**
```
📍 / (Home)
├── 🔄 Redirecionamento automático
├── 🎯 router.replace('/panorama')
└── 📄 Componente: page.tsx (10 linhas)
```

### **📊 Dashboard**
```
📍 /dashboard
├── 📈 Métricas por período (7/30/90 dias)
├── 🎯 Hit rate, ROI, profit total
├── 📊 Gráficos de performance
├── 🏆 Análise por mercado
├── 📋 Wins/Losses/Unresolved
├── 🎨 Visual com recharts
└── 📄 Componente: page.tsx (185 linhas)
```

### **🎯 Panorama**
```
📍 /panorama
├── 📅 Seleção de data (DDMM)
├── 🔍 Busca CSV do Supabase
├── 🎯 Análise pré-live com odds
├── 📊 8 perfis de jogos
│   ├── 🔥 Tiroteio (shootout_btts)
│   ├── 🏆 Dominant (dominant)
│   ├── 🎯 Chutes HT (chutes_ht_fav)
│   ├── 🚩 Cantos (corner_dominant)
│   ├── ⚡ Alta Ofensiva (high_offense_balanced)
│   ├── 💜 Ambas Marcam (balanced_btts)
│   ├── 🔒 Low Goals (low_goals)
│   └── 💤 Generic (generic)
├── 🏠 Mercados principais
├── 📊 Combos inteligentes
├── 🚩 Cantos FT
├── 🎨 Tags visuais
└── 📄 Componente: page.tsx (623 linhas)
```

### **🔍 Multiple Analyzer**
```
📍 /multiple-analyzer
├── 📅 Date picker (DDMM)
├── 🔍 Busca CSV do Supabase
├── 🎯 Análise completa pré-live
├── 📊 Qualidade (score ≥ 45%, conf ≥ 35%)
├── 🏠 FT Box Builder
├── 📊 Sinfonia de múltiplas
├── 🎯 Odds reais
├── 📋 Logs detalhados
├── 🚩 Filtros de perfis
└── 📄 Componente: page.tsx (1549 linhas)
```

### **🧪 Patterns**
```
📍 /patterns
├── 🎯 Análise de padrões
├── 📊 Estratégias identificadas
├── 🏆 Métricas de performance
├── 📋 Backtesting de padrões
└── 📄 Componente: page.tsx
```

### **⏪ Backtest**
```
📍 /backtest
├── 📊 Testes históricos
├── 🎯 Análise de performance
├── 📈 Métricas detalhadas
├── 🏆 Resultados por estratégia
├── 📋 useBacktest hook
└── 📄 Componente: page.tsx
```

### **🛠️ Admin**
```
📍 /admin
├── 🎛️ Painel administrativo
├── 📊 Status do sistema
├── 🔄 Orquestração de processos
├── 🗄️ Gestão do Supabase
├── 📊 Métricas do sistema
├── 🎯 Configurações
├── 🧪 Testes e validações
├── 📊 Pipeline integrity
├── 🔄 Sync local → Supabase
└── 📄 Componente: page.tsx (1948 linhas)
```

### **🔬 Admin Lab (Multiples Lab)**
```
📍 /admin/multiples-lab
├── 📁 Upload de CSV
├── 💾 saveCsvToSupabase() → csv_diario
├── 📊 Parse e validação
├── 🎯 Geração de múltiplas
├── 📋 Laboratório de estratégias
├── 🎨 Visual de resultados
├── 📊 Logs de processamento
├── 🔄 Feedback visual
├── 🎯 Análise de qualidade
└── 📄 Componente: page.tsx
```

---

## 🔌 **Árvore de APIs**

### **📊 APIs de Dados**
```
📍 /api/football-odds (GET)
├── 🎯 Odds em tempo real
├── 📊 Cache server-side
├── 🔄 Rate limiting
└── 📄 route.ts

📍 /api/football-results (GET)
├── 📊 Resultados de jogos
├── 🎯 Dados históricos
├── 📈 Estatísticas
└── 📄 route.ts

📍 /api/football-status (GET)
├── 📊 Status dos jogos
├── 🎯 NS/FT/POSTPONED
├── 📋 Atualizações
└── 📄 route.ts

📍 /api/games (GET)
├── 📊 Lista de jogos
├── 🎯 Filtragem
├── 📋 Metadata
└── 📄 route.ts
```

### **🔄 APIs de Processamento**
```
📍 /api/import (POST)
├── 📋 Importação de CSV
├── 💾 Salvamento no Supabase
├── 🎯 Processamento de jogos
├── 📊 Trigger evaluations
├── 🔄 getImportDateISOFromCSV()
├── 💾 saveCsvDiario()
├── 📊 Análise completa
└── 📄 route.ts (263 linhas)

📍 /api/lab-multiples (POST)
├── 🎯 Geração de múltiplas
├── 📊 Análise de laboratório
├── 🎨 Processamento avançado
├── 📋 Resultados detalhados
└── 📄 route.ts

📍 /api/test-poisson (POST)
├── 🧪 Testes do motor Poisson
├── 📊 Validações
├── 🎯 A/B testing
├── 📋 Resultados
└── 📄 route.ts
```

---

## 🗄️ **Fluxo de Dados: Supabase**

### **📊 Tabelas Principais**
```
🗄️ csv_diario
├── 📅 data (YYYY-MM-DD) - Chave única
├── 📄 csv_text - Conteúdo do CSV
├── 🔄 upsert diário
├── 🎯 Fonte única de dados
└── 💾 Persistência garantida

🗄️ trigger_suggestions
├── 🎯 Avaliações do motor
├── 📊 Scores e confiança
├── 🏆 Mercados sugeridos
├── 📋 Timestamps
└── 🔄 Updates automáticos

🗄️ decision_games
├── 🎯 Jogos analisados
├── 📊 Métricas de decisão
├── 🏆 Resultados
├── 📋 Status tracking
└── 🔄 Histórico completo
```

---

## 🔄 **Fluxo Completo: Do Upload ao Panorama**

### **🚀 Passo 1: Upload do CSV**
```
📁 /admin/multiples-lab
├── 📤 Usuário seleciona arquivo CSV
├── 📖 FileReader lê conteúdo
├── 💾 saveCsvToSupabase(text) → csv_diario
├── 📅 Chave: YYYY-MM-DD (fuso pt-BR)
├── 📊 parseLabCSV() → Array de jogos
├── 🎯 generateMultiples() → /api/lab-multiples
├── ✅ Feedback visual de sucesso
└── 📋 Logs detalhados
```

### **🚀 Passo 2: Processamento na API**
```
🔌 /api/import (POST)
├── 📋 Recebe csvText
├── 🔄 getImportDateISOFromCSV() → YYYY-MM-DD
├── 💾 saveCsvDiario(data, csvText) → csv_diario
├── 🎯 processCSV() → Análise completa
├── 📊 evaluateAllMarkets() → trigger_suggestions
├── 🏆 Classificação de jogos
├── 📋 Cálculo de métricas
├── ✅ Response com resultados
└── 📊 Logs de processamento
```

### **🚀 Passo 3: Visualização no Panorama**
```
🎯 /panorama
├── 📅 Usuário seleciona data
├── 🔍 loadCsvDiario(DDMM) → Supabase
├── 🔄 DDMM → YYYY-MM-DD
├── 💾 Busca csv_diario[data]
├── 📊 CSV encontrado → parseCSV()
├── 🎯 analyzeLiveMultiplesAsync()
├── 📋 Filtra jogos NS
├── 🎯 Classifica perfis
├── 🏠 Gera mercados principais
├── 📊 Cria combos inteligentes
├── 🚩 Adiciona Cantos FT
├── 🎨 Aplica tags visuais
├── ✅ Renderiza jogos
└── 📋 Logs de qualidade
```

---

## 🎯 **Estrutura de Componentes**

### **🧩 Hooks Principais**
```
🎣 useBacktest()
├── 📊 Dados de backtest
├── 🎯 todayGames()
├── 📋 lastCsvText
├── 🔄 loadCsvDiario()
└── 💾 Persistência

🎣 useDashboardMetrics()
├── 📈 Métricas filtradas
├── 🎯 Análise por período
├── 📊 Wins/Losses/ROI
├── 🏆 Performance
└── 📋 Gráficos
```

### **🧩 Bibliotecas Principais**
```
📊 pre-live-multiple-analyzer.ts
├── 🎯 Análise pré-live
├── 📋 Classificação de perfis
├── 🏠 Mercados principais
├── 📊 Combos inteligentes
├── 🚩 Cantos FT
├── 🎨 Pattern lines
└── 🔄 Modo panorama/full

📊 poisson-engine.ts
├── 🎯 classifyProfile()
├── 📋 8 perfis implementados
├── 🏆 Cálculo de scores
├── 📊 Confiança
├── 🎯 Probabilidades
└── 🔄 Thresholds ajustáveis

📊 engine.js
├── 🎯 parseCSV()
├── 📋 extractDateFromHour()
├── 🏆 getFavorito()
├── 📊 computeScore()
├── 🎯 computeConfidence()
├── 📋 suggestMainMarket()
├── 🎨 suggestCombo()
└── 🔄 Funções core
```

---

## 🎨 **UI/UX Flow**

### **📱 Navegação Principal**
```
🏠 Home → 🎯 Panorama (página principal)
├── 📊 Dashboard (analytics)
├── 🔍 Multiple Analyzer (análise detalhada)
├── 🧪 Patterns (padrões)
├── ⏪ Backtest (testes)
└── 🛠️ Admin (administração)
```

### **🎨 Componentes UI**
```
🎨 NavHeader
├── 📱 Navegação responsiva
├── 🎯 Links principais
├── 📊 Status indicators
└── 🔄 Auto-hide

🎨 KPI Cards
├── 📊 Métricas principais
├── 🎯 Hit rates
├── 💰 Profit/ROI
├── 📈 Gráficos
└── 🎨 Visual clean

🎨 Empty States
├── 📋 Mensagens informativas
├── 🎯 Call-to-actions
├── 🎨 Ícones descritivos
└── 📱 UX friendly
```

---

## 🎉 **Status Final: SISTEMA COMPLETO MAPEADO**

### **✅ Arquitetura Completa:**
- **8 páginas** principais implementadas
- **7 APIs** funcionais
- **Fluxo completo** do CSV ao Panorama
- **Supabase** como backend
- **Next.js** como framework

### **🚀 Funcionalidades Implementadas:**
- **Upload e processamento** de CSV
- **Análise pré-live** com odds reais
- **8 perfis** de jogos inteligentes
- **Mercados específicos** por perfil
- **Dashboard** com métricas
- **Backtest** completo
- **Admin** robusto

### **🎯 Experiência do Usuário:**
- **Navegação intuitiva**
- **Visual rico** e informativo
- **Logs detalhados** para debugging
- **Feedback visual** constante
- **Performance otimizada**

---

## **🎊 ÁRVORE DE ROTAS - 100% MAPEADA!**

### **🌳 Sistema Completo - Documentado:**
- ✅ **8 páginas** mapeadas
- ✅ **7 APIs** documentadas
- ✅ **Fluxo completo** detalhado
- ✅ **Componentes** identificados
- ✅ **Banco de dados** estruturado

### **🚊 Benefícios do Mapeamento:**
- ✅ **Visão clara** da arquitetura
- ✅ **Fluxo otimizado** identificado
- ✅ **Pontos de melhoria** localizados
- ✅ **Documentação** completa
- ✅ **Manutenção** facilitada

---

## **🎉 MISSÃO CUMPRIDA - SISTEMA COMPLETO MAPEADO!**

### **🏆 Arquitetura Robusta - Implementada:**
- ✅ **Fluxo completo** do CSV ao Panorama
- ✅ **8 perfis** inteligentes implementados
- ✅ **APIs robustas** funcionais
- ✅ **UI/UX otimizada**
- ✅ **Banco de dados** estruturado

**🎊 **O SISTEMA ESTÁ COMPLETO E FUNCIONAL COM TODAS AS ROTAS MAPEADAS!** **

**Arquitetura robusta, fluxo otimizado e experiência rica para o usuário!** 🚀✨
