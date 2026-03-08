"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBacktest } from "../../hooks/useBacktest";
import { NavHeader } from "../../components/NavHeader";
import { Settings, Database, Trash2, Upload, Key, AlertTriangle, Beaker, BarChart3, Play, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { handleFetchRealOdds, handleClearDatabase, handleProcessar } from "../../lib/orchestration/admin-orchestration";
import { analyzeLiveMultiplesAsync } from "../../lib/pre-live-multiple-analyzer";
import { patchAnalyzerWithPoisson } from "../../lib/poisson-ab-test";
import { runPoissonABTest } from "../../lib/poisson-test-runner";
import { PoissonMode } from "../../lib/poisson-capsule";
import { mapToDecisionGame } from "../../lib/decision-game-mapper";
import { DecisionGame } from "../../types/decision-game";
import { calculateMetricsByDominantReading, calculateCoherenceMetrics, DecisionGameMetrics, CoherenceMetrics, ReadingStatus } from "../../lib/decision-game-analytics";

import { C, KPI as SharedKPI } from "../../components/ui";

export default function AdminPage() {
  const router = useRouter();
  const {
    file,
    loading,
    results,
    err,
    saveError,
    enriching,
    enrichErr,
    
    // Funções do hook
    handleImport,
    handleClear,
    handleEnrich,
    syncMissingResults,
    setFile,
    
    // 🆕 Wrappers para fluxo único
    importFromCSV,
    enrichWithOdds,
    
  } = useBacktest();

  // 🆕 Estados para odds reais (similar ao multiple-analyzer)
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [odds, setOdds] = useState<any>({});
  const [unmatchedGames, setUnmatchedGames] = useState<any[]>([]);
  const [oddsError, setOddsError] = useState<string>("");

  // 🧪 Estados Poisson Experimental
  const [poissonExpanded, setPoissonExpanded] = useState(false);
  const [poissonMode, setPoissonMode] = useState<PoissonMode>('off');
  const [poissonLogs, setPoissonLogs] = useState<string[]>([]);
  const [poissonTesting, setPoissonTesting] = useState(false);
  const [poissonMetrics, setPoissonMetrics] = useState<any>(null);
  const [analyzerPatched, setAnalyzerPatched] = useState(false);

  // 🆕 Estados DecisionGame (Camada 2 - Mapa de Decisão)
  const [decisionGames, setDecisionGames] = useState<DecisionGame[]>([]);
  const [decisionMetrics, setDecisionMetrics] = useState<DecisionGameMetrics[]>([]);
  const [coherenceMetrics, setCoherenceMetrics] = useState<CoherenceMetrics | null>(null);

  // 🆕 Converter resultados existentes para DecisionGame (apenas visualização Admin)
  useEffect(() => {
    if (results.length > 0) {
      const decisions = results.map((result, index) => mapToDecisionGame(result, index));
      setDecisionGames(decisions);
      
      // 🆕 Calcular métricas históricas
      const metrics = calculateMetricsByDominantReading(decisions);
      const coherence = calculateCoherenceMetrics(decisions);
      setDecisionMetrics(metrics);
      setCoherenceMetrics(coherence);
    }
  }, [results]);

  // 🆕 Handler para buscar odds reais (importado do orchestration)
  const fetchRealOdds = () => {
    handleFetchRealOdds(results, setOdds, setLoadingOdds, setOddsError);
  };

  // 🧪 Handlers Poisson Experimental
  const addPoissonLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setPoissonLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleApplyPoissonPatch = async () => {
    try {
      addPoissonLog(`🔧 Aplicando patch Poisson modo: ${poissonMode.toUpperCase()}`);
      const analyzer = { buildBingoSeguro: analyzeLiveMultiplesAsync };
      patchAnalyzerWithPoisson(analyzer, poissonMode);
      setAnalyzerPatched(true);
      addPoissonLog(`✅ Patch aplicado com sucesso`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      addPoissonLog(`❌ Erro ao aplicar patch: ${errorMsg}`);
    }
  };

  const handleDebugPoissonReal = async () => {
    setPoissonTesting(true);
    try {
      addPoissonLog(`🔍 Iniciando debug com entrada bruta do sistema...`);
      
      // 📊 Usar mesma entrada bruta do fluxo real (ordem corrigida)
      let csvText: string | null = null;
      let dataSource = '';
      
      // Prioridade 1: lastCsvText (localStorage)
      const lastCsv = localStorage.getItem('lucrativo-last-csv') || '';
      if (lastCsv) {
        dataSource = 'lastCsvText (localStorage)';
        csvText = lastCsv;
        addPoissonLog(`📊 Fonte: ${dataSource} - ${lastCsv.split('\n').length} linhas`);
      }
      // Prioridade 2: mock separado
      else {
        dataSource = 'mock separado';
        const todayDDMM = `08-03-2026`;
        csvText = `match;league;hour;status;home_avg_goals;away_avg_goals;home_attack;away_defense;away_attack;home_defense;btts_yes;btts_no;over_2_5_ft;under_2_5_ft;over_0_5_ht;under_0_5_ht;over_1_5_ft;under_1_5_ft;corners_ft_over_9_5;corners_ft_under_9_5
"Flamengo x Vasco";"Brasileirão";"${todayDDMM} 20:00";"NS";2.5;2.0;3.0;1.5;2.8;1.8;2.25;1.61;1.95;1.85;1.35;3.00;1.40;2.85;1.85;5.10
"Palmeiras x Corinthians";"Brasileirão";"${todayDDMM} 18:00";"NS";2.2;1.8;2.8;1.3;2.5;1.5;2.10;1.67;2.05;1.75;1.40;2.85;1.40;2.90;1.90;5.30`;
        addPoissonLog(`📊 Fonte: ${dataSource} - ${csvText.split('\n').length} linhas`);
      }
      
      if (!csvText) {
        addPoissonLog(`❌ Nenhum CSV bruto disponível`);
        return;
      }
      
      // 📊 Log da estrutura bruta (primeiras linhas)
      const lines = csvText.split('\n');
      addPoissonLog(`📊 Estrutura CSV (primeiras 3 linhas):`);
      lines.slice(0, 3).forEach((line, i) => {
        addPoissonLog(`   Linha ${i}: ${line}`);
      });
      
      // Criar analyzer wrapper (contrato padronizado)
      const analyzer = { 
        buildBingoSeguro: async (input: string | string[]) => {
          // Contrato padronizado: aceita string OU string[]
          const csvInput = Array.isArray(input) ? input[0] : input;
          return await analyzeLiveMultiplesAsync(csvInput);
        }
      };
      
      // Rodar teste A/B com logs estruturados
      const testResults = await runPoissonABTest(analyzer, [csvText]);
      setPoissonMetrics(testResults);
      
      // Mostrar logs estruturados
      if (testResults.structuredLogs) {
        const logs = testResults.structuredLogs;
        addPoissonLog(`\n📊 === RESUMO ESTRUTURADO ===`);
        addPoissonLog(`📊 Fonte de dados: ${dataSource}`);
        addPoissonLog(`📊 Jogos recebidos: ${logs.gamesReceived}`);
        addPoissonLog(`✅ Jogos válidos: ${logs.gamesValid}`);
        addPoissonLog(`🎯 Candidatos gerados: ${logs.candidatesGenerated}`);
        addPoissonLog(`✅ Candidatos aprovados: ${logs.candidatesApproved}`);
        addPoissonLog(`🎯 Seleções finais: ${logs.finalSelections}`);
        
        if (Object.keys(logs.rejectedReasons).length > 0) {
          addPoissonLog(`❌ Motivos de descarte:`);
          Object.entries(logs.rejectedReasons).forEach(([reason, count]) => {
            addPoissonLog(`   - ${reason}: ${count}`);
          });
        }
      }
      
      // 📊 Fallback de inspeção (results apenas para visualização)
      if (results.length > 0) {
        addPoissonLog(`\n📊 === INSPEÇÃO RESULTS (apenas visual) ===`);
        addPoissonLog(`📊 Results disponíveis: ${results.length}`);
        addPoissonLog(`📊 Estrutura do primeiro result: ${Object.keys(results[0]).join(', ')}`);
      }
      
      addPoissonLog(`✅ Debug com entrada bruta concluído`);
      
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      addPoissonLog(`❌ Erro no debug: ${errorMsg}`);
    } finally {
      setPoissonTesting(false);
    }
  };

  const clearPoissonLogs = () => {
    setPoissonLogs([]);
    setPoissonMetrics(null);
  };

  // 🆕 Estados para fluxo unificado
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{
    saved: number;
    withOdds: number;
  } | null>(null);

  // 🆕 Estados locais para Admin
  const [apiKey, setApiKey] = useState("");
  const [clearing, setClearing] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [testingSave, setTestingSave] = useState(false);
  const [databaseInfo, setDatabaseInfo] = useState<any>(null);
  const [databaseError, setDatabaseError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // 🆕 Detectar se está no cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 🆕 Handler de seleção do CSV
  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setProcessResult(null);
    // Ler primeira linha para preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      setCsvPreview(`${lines.length - 1} jogos encontrados`);
    };
    reader.readAsText(file);
  };

  // 🆕 Handler de processamento completo (importado do orchestration)
  const processar = () => {
    if (!csvFile) return;
    handleProcessar(
      csvFile,
      setDatabaseInfo,
      setDatabaseError,
      setSuccessMessage,
      setProcessing,
      importFromCSV,
      enrichWithOdds
    );
  };

  // 🆕 Handler de limpeza de banco (importado do orchestration)
  const clearDatabase = () => {
    handleClearDatabase(setDatabaseInfo, setDatabaseError, setSuccessMessage);
  };

  // 🆕 Wrapper functions para React events
  const handleFetchRealOddsClick = () => {
    handleFetchRealOdds(results, setOdds, setLoadingOdds, setOddsError);
  };

  const handleProcessarClick = () => {
    if (!csvFile) return;
    handleProcessar(
      csvFile,
      setDatabaseInfo,
      setDatabaseError,
      setSuccessMessage,
      setProcessing,
      importFromCSV,
      enrichWithOdds
    );
  };

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      alert("Por favor, insira uma chave de API válida.");
      return;
    }
    
    // TODO: Salvar API key no Supabase ou localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem("football-api-key", apiKey);
      alert("✅ Chave de API salva com sucesso!");
    }
    setShowApiKeyInput(false);
  };

  const handleTestSupabaseSave = async () => {
    setTestingSave(true);
    try {
      // Importar função de teste
      const { testSupabaseSave } = await import("../../lib/test-supabase-save");
      const success = await testSupabaseSave();
      
      if (success) {
        alert("✅ Teste de save do Supabase OK! Colunas funcionando.");
      } else {
        alert("❌ Teste falhou. Verifique console para detalhes.");
      }
    } catch (e: any) {
      alert("❌ Erro no teste: " + (e?.message ?? String(e)));
    } finally {
      setTestingSave(false);
    }
  };

  const stats = {
    totalGames: results.length,
    todayGames: results.filter(r => {
      const today = new Date().toISOString().split('T')[0];
      const resultDate = r.hour?.split(' ')[0] || '';
      return resultDate === today;
    }).length,
    eliteGames: results.filter(r => (r.score || 0) > 80).length,
    pendingData: results.filter(r => r.mainMarket.result === "pending_manual").length
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      
      <NavHeader activePage="/admin" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: '40px' }}>
        
        {/* Alerta de erro de sincronização */}
        {saveError && (
          <div style={{ 
            background: '#3a1a1a', 
            border: '1px solid #f85149', 
            borderRadius: 8, 
            padding: 12, 
            marginBottom: 24,
            color: '#f85149', 
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertTriangle size={16} />
            ⚠️ {saveError}
          </div>
        )}

        {/* Título */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings size={32} color={C.accent} />
            Admin
          </h1>
          <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
            Configurações e gerenciamento do sistema
          </p>
        </div>

      {/* Estatísticas do Banco */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Database size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Estatísticas do Banco
          </h2>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <SharedKPI label="Total de Jogos" value={String(stats.totalGames)} />
          <SharedKPI label="Jogos Hoje" value={String(stats.todayGames)} color={stats.todayGames > 0 ? C.green : C.gray} />
          <SharedKPI label="Jogos Elite ⭐" value={String(stats.eliteGames)} color={C.yellow} />
          <SharedKPI label="Dados Pendentes" value={String(stats.pendingData)} color={stats.pendingData > 0 ? C.yellow : C.green} />
        </div>
      </div>

      {/* 🆕 Fluxo Único de Carregamento */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Upload size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            📥 Carregar Dados do Dia
          </h2>
        </div>

        {/* Instrução contextual */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Fluxo único:</strong><br/>
          1️⃣ Selecione o CSV do PackBall (jogos NS do dia)<br/>
          2️⃣ Clique "Processar e Salvar" — faz tudo automaticamente<br/>
          3️⃣ Navegue pelas abas — dados já estarão carregados
        </div>

        {/* PASSO 1: Upload */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: C.muted, fontSize: 13, marginBottom: 8 }}>
            Passo 1 — CSV do dia (jogos NS)
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={e => e.target.files?.[0] && handleCsvSelect(e.target.files[0])}
            style={{ color: C.text, fontSize: 13 }}
          />
          {csvPreview && (
            <span style={{ color: C.green, fontSize: 13, marginLeft: 12 }}>✅ {csvPreview}</span>
          )}
        </div>

        {/* PASSO 2: Processar */}
        <button
          onClick={handleProcessarClick}
          disabled={!csvFile || processing}
          style={{
            background: csvFile && !processing ? C.green : C.gray,
            color: csvFile && !processing ? '#fff' : '#555',
            border: 'none', borderRadius: 8,
            padding: '12px 28px', fontSize: 14,
            fontWeight: 700, cursor: csvFile ? 'pointer' : 'not-allowed',
            width: '100%', marginBottom: 12,
          }}
        >
          {processing ? '⏳ Processando...' : '🚀 Processar e Salvar'}
        </button>

        {/* PASSO 3: Confirmação */}
        {processResult && (
          <div style={{ background: '#0d2818', border: `1px solid ${C.green}`, borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>
                ✅ Sistema atualizado!
              </div>
              <div style={{ color: C.muted, fontSize: 13 }}>
                {processResult.saved} jogos salvos
                {processResult.withOdds > 0 &&
                  ` · ${processResult.withOdds} com odds reais`}
              </div>
            </div>
            <button
              onClick={() => router.push('/panorama')}
              style={{ background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Ver Panorama →
            </button>
          </div>
        )}

        {/* Erros */}
        {err && (
          <div style={{
            padding: "12px",
            background: "#450a0a",
            border: `1px solid ${C.red}`,
            borderRadius: "6px",
            color: C.red,
            fontSize: "13px",
            marginTop: 12
          }}>
            ⚠️ {err}
          </div>
        )}
      </div>

      {/* Configurações de API */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Key size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Configurações de API
          </h2>
        </div>
        
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: C.muted, marginBottom: "8px" }}>
            API Football Key
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {showApiKeyInput ? (
              <>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Insira sua chave de API"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: "6px",
                    color: C.text,
                    fontSize: "14px"
                  }}
                />
                <button
                  onClick={handleSaveApiKey}
                  style={{
                    padding: "8px 16px",
                    background: C.green,
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600
                  }}
                >
                  ✅ Salvar
                </button>
                <button
                  onClick={() => setShowApiKeyInput(false)}
                  style={{
                    padding: "8px 16px",
                    background: C.gray,
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <div style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  color: C.muted,
                  fontSize: "14px"
                }}>
                  {isClient && localStorage.getItem('football-api-key') ? '••••••••••••••••' : 'Nenhuma chave configurada'}
                </div>
                <button
                  onClick={() => setShowApiKeyInput(true)}
                  style={{
                    padding: "8px 16px",
                    background: C.accent,
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600
                  }}
                >
                  ⚙️ Configurar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 🆕 Enriquecimento Manual */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Database size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Enriquecimento Manual
          </h2>
        </div>
        
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: C.muted, marginBottom: "12px" }}>
            Buscar odds reais da API-Football (Bet365) para múltiplas e FT Box Builder.
          </div>
          
          <button
            onClick={handleFetchRealOddsClick}
            disabled={loadingOdds}
            style={{
              background: loadingOdds ? C.gray : C.green,
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loadingOdds ? "not-allowed" : "pointer",
              width: "100%"
            }}
          >
            {loadingOdds ? '⏳ Buscando odds...' : '💰 Buscar Odds Reais (API-Football)'}
          </button>
          
          {/* Mostrar jogos não encontrados */}
          {unmatchedGames.length > 0 && (
            <div style={{
              marginTop: "16px",
              padding: "12px",
              background: "#450a0a",
              border: `1px solid ${C.red}`,
              borderRadius: "6px",
              color: C.red,
              fontSize: "12px"
            }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                ⚠️ {unmatchedGames.length} jogos não encontrados na API:
              </div>
              <div style={{ maxHeight: "100px", overflowY: "auto" }}>
                {unmatchedGames.slice(0, 5).map((game, i) => (
                  <div key={i} style={{ marginBottom: "2px" }}>
                    {game.home || game.homeTeam || '?'} x {game.away || game.awayTeam || '?'}
                  </div>
                ))}
                {unmatchedGames.length > 5 && (
                  <div style={{ fontStyle: "italic", marginTop: "4px" }}>
                    ... e mais {unmatchedGames.length - 5} jogos
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Botão antigo mantido para compatibilidade */}
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "8px" }}>
              ⚙️ Enriquecimento estatístico (legado):
            </div>
            <button
              onClick={async () => {
                if (!confirm("⚠️ Isso irá enriquecer todos os jogos FT com dados estatísticos da API. Continuar?")) return;
                try {
                  const apiKey = localStorage.getItem('football-api-key');
                  if (!apiKey) {
                    alert("❌ Configure API key primeiro!");
                    return;
                  }
                  await enrichWithOdds(apiKey);
                  alert(`✅ Enriquecimento estatístico concluído! Verifique o console para logs.`);
                } catch (e: any) {
                  alert("❌ Erro: " + (e?.message ?? String(e)));
                }
              }}
              disabled={enriching}
              style={{
                background: enriching ? C.gray : C.gray,
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: enriching ? "not-allowed" : "pointer",
                width: "100%"
              }}
            >
              {enriching ? '⏳ Enriquecendo...' : '🔄 Enriquecer Estatísticas (Legado)'}
            </button>
          </div>
          
          {enrichErr && (
            <div style={{
              padding: "12px",
              background: "#450a0a",
              border: `1px solid ${C.red}`,
              borderRadius: "6px",
              color: C.red,
              fontSize: "13px",
              marginTop: "12px"
            }}>
              ⚠️ {enrichErr}
            </div>
          )}
        </div>
      </div>

      {/* Teste de Conexão Supabase */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Database size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Teste de Conexão Supabase
          </h2>
        </div>
        
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: C.muted, marginBottom: "12px" }}>
            Verificar se as colunas novas (combo_data, poison_data, favorito_data) estão funcionando para save.
          </div>
          
          <button
            onClick={handleTestSupabaseSave}
            disabled={testingSave}
            style={{
              padding: "12px 24px",
              background: testingSave ? C.gray : C.accent,
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: testingSave ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              width: "100%"
            }}
          >
            {testingSave ? '🔄 Testando...' : '🧪 Testar Save Supabase'}
          </button>
        </div>
      </div>

      {/* 🧪 Poisson Experimental */}
      <div style={{ background: C.card, border: `2px solid ${poissonExpanded ? '#f0c040' : C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div 
          style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between",
            cursor: "pointer",
            marginBottom: poissonExpanded ? "20px" : "0"
          }}
          onClick={() => setPoissonExpanded(!poissonExpanded)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Beaker size={20} color={poissonExpanded ? '#f0c040' : C.accent} />
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: poissonExpanded ? '#f0c040' : C.text }}>
              🧪 Poisson Experimental
            </h2>
            {analyzerPatched && (
              <span style={{
                background: '#f0c040',
                color: '#000',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                PATCHED
              </span>
            )}
          </div>
          <div style={{ fontSize: "12px", color: C.muted }}>
            {poissonExpanded ? '▼' : '▶'}
          </div>
        </div>

        {poissonExpanded && (
          <>
            {/* Seletor de Modo */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "14px", color: C.muted, marginBottom: "8px" }}>
                Modo Poisson:
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(['off', 'assist', 'tie_breaker', 'strict'] as PoissonMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPoissonMode(mode)}
                    style={{
                      padding: "6px 12px",
                      background: poissonMode === mode ? '#f0c040' : C.gray,
                      color: poissonMode === mode ? '#000' : C.text,
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      textTransform: "uppercase"
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Botões de Ação */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
              <button
                onClick={handleApplyPoissonPatch}
                disabled={analyzerPatched}
                style={{
                  padding: "10px 16px",
                  background: analyzerPatched ? C.gray : '#f0c040',
                  color: analyzerPatched ? C.text : '#000',
                  border: "none",
                  borderRadius: "8px",
                  cursor: analyzerPatched ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <RotateCcw size={14} />
                {analyzerPatched ? 'Patch Aplicado' : 'Aplicar Patch Poisson'}
              </button>

              <button
                onClick={handleDebugPoissonReal}
                disabled={poissonTesting}
                style={{
                  padding: "10px 16px",
                  background: "#3fb950",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: poissonTesting ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <BarChart3 size={14} />
                {poissonTesting ? 'Debugging...' : 'Debug (Entrada Bruta)'}
              </button>
            </div>

            {/* Logs */}
            {poissonLogs.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "14px", color: C.muted }}>
                    Logs ({poissonLogs.length})
                  </div>
                  <button
                    onClick={clearPoissonLogs}
                    style={{
                      padding: "4px 8px",
                      background: C.gray,
                      color: C.text,
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "11px"
                    }}
                  >
                    Limpar
                  </button>
                </div>
                <div style={{
                  background: '#0d1117',
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  padding: "12px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  fontFamily: 'monospace',
                  fontSize: "11px",
                  lineHeight: "1.4"
                }}>
                  {poissonLogs.map((log, index) => (
                    <div key={index} style={{ color: '#8b949e', marginBottom: "2px" }}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Métricas */}
            {poissonMetrics && (
              <div>
                <div style={{ fontSize: "14px", color: C.muted, marginBottom: "8px" }}>
                  <BarChart3 size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  Métricas A/B:
                </div>
                <div style={{
                  background: '#0d1117',
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  padding: "12px",
                  fontFamily: 'monospace',
                  fontSize: "11px",
                  lineHeight: "1.4"
                }}>
                  {Object.entries(poissonMetrics).map(([mode, data]: [string, any]) => (
                    <div key={mode} style={{ color: '#8b949e', marginBottom: "4px" }}>
                      <span style={{ color: '#f0c040' }}>{mode.toUpperCase()}:</span> {data?.selections?.length || 0} seleções
                      {data?.combinedOdd && ` | Odd: ${data.combinedOdd}`}
                      {data?.expectedValue && ` | Edge: ${(data.expectedValue * 100).toFixed(1)}%`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 🆕 DecisionGame Analytics (Camada 4 - Validação Histórica) */}
      {decisionMetrics.length > 0 && (
        <div style={{ background: C.card, border: `2px solid ${C.accent}`, borderRadius: "12px", padding: "24px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <BarChart3 size={20} color={C.accent} />
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: C.accent }}>
              DecisionGame Analytics (Camada 4)
            </h3>
          </div>
          
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>
            📊 Métricas históricas por dominantReading - validação sem alterar produção
          </div>
          
          {/* Métricas de Coerência */}
          {coherenceMetrics && (
            <div style={{ background: "#f8f9fa", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "13px" }}>
                🎯 Coerência dominantReading vs mainMarket
              </div>
              <div style={{ fontSize: "11px", color: "#6c757d", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                <div>Total: {coherenceMetrics.totalJogos}</div>
                <div>Compatíveis: {coherenceMetrics.jogosCompativeis}</div>
                <div>Fallback: {coherenceMetrics.jogosFallback}</div>
                <div style={{ color: coherenceMetrics.coerenciaPercentual >= 70 ? '#28a745' : '#dc3545' }}>
                  Coerência: {coherenceMetrics.coerenciaPercentual.toFixed(1)}%
                </div>
              </div>
            </div>
          )}
          
          {/* Métricas por dominantReading com triagem operacional */}
          <div style={{ display: "grid", gap: "8px" }}>
            {decisionMetrics.slice(0, 5).map((metric, i) => (
              <div key={i} style={{ 
                background: "#f8f9fa", 
                padding: "12px", 
                borderRadius: "8px",
                border: `1px solid ${
                  metric.status === 'approved' ? '#28a745' : 
                  metric.status === 'blocked' ? '#dc3545' : 
                  '#ffc107'
                }`
              }}>
                <div style={{ 
                  fontWeight: 600, 
                  marginBottom: "4px", 
                  fontSize: "13px", 
                  color: C.accent,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>{metric.dominantReading.toUpperCase()}</span>
                  <span style={{
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: 
                      metric.status === 'approved' ? '#28a745' : 
                      metric.status === 'blocked' ? '#dc3545' : 
                      '#ffc107',
                    color: "white"
                  }}>
                    {metric.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "#6c757d", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", marginBottom: "4px" }}>
                  <div>Amostra: {metric.amostra}</div>
                  <div>Hit Rate: {metric.hitRate.toFixed(1)}%</div>
                  <div style={{ color: metric.roi >= 0 ? '#28a745' : '#dc3545' }}>
                    ROI: {metric.roi.toFixed(1)}%
                  </div>
                  <div>Odd Média: {metric.oddMedia.toFixed(2)}</div>
                  <div>Fallback: {metric.fallback.toFixed(1)}%</div>
                  <div style={{ 
                    color: metric.amostra < 5 ? '#dc3545' : '#6c757d',
                    fontWeight: metric.amostra < 5 ? 600 : 400
                  }}>
                    {metric.amostra < 5 ? '⚠️ Amostra baixa' : 'OK'}
                  </div>
                </div>
                <div style={{ 
                  fontSize: "10px", 
                  color: "#8b949e", 
                  fontStyle: "italic",
                  borderTop: "1px solid #e9ecef",
                  paddingTop: "4px"
                }}>
                  {metric.motivo}
                </div>
              </div>
            ))}
          </div>
          
          {decisionMetrics.length > 5 && (
            <div style={{ fontSize: "11px", color: C.muted, marginTop: "8px", textAlign: "center" }}>
              ...mais {decisionMetrics.length - 5} dominantReadings
            </div>
          )}
        </div>
      )}

      {/* 🆕 DecisionGame Debug (Camada 2 - Mapa de Decisão) */}
      {decisionGames.length > 0 && (
        <div style={{ background: C.card, border: `2px solid ${C.accent}`, borderRadius: "12px", padding: "24px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <BarChart3 size={20} color={C.accent} />
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: C.accent }}>
              DecisionGame Debug (Camada 2)
            </h3>
          </div>
          
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>
            📊 Objeto canônico derivado de BetResult - apenas visualização Admin
          </div>
          
          <div style={{ display: "grid", gap: "8px" }}>
            {decisionGames.slice(0, 3).map((game, i) => (
              <div key={i} style={{ 
                background: "#f8f9fa", 
                padding: "12px", 
                borderRadius: "8px",
                border: "1px solid #e9ecef"
              }}>
                <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>
                  {game.context.match}
                </div>
                <div style={{ fontSize: "11px", color: "#6c757d", lineHeight: "1.4" }}>
                  <div>📊 Leitura: <span style={{ color: C.accent }}>{game.dominantReading}</span></div>
                  <div>🎯 Mercado: {game.mainMarket.market} (Odd: {game.mainMarket.odd})</div>
                  <div>💡 Explicação: {game.explanationShort}</div>
                  <div>📈 Score: {game.debugMeta.originalScore} | Conf: {game.debugMeta.originalConfidence}%</div>
                  <div>🔍 ProductFit: 
                    {Object.entries(game.productFit).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Nenhum'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {decisionGames.length > 3 && (
            <div style={{ fontSize: "11px", color: C.muted, marginTop: "8px", textAlign: "center" }}>
              ...mais {decisionGames.length - 3} jogos
            </div>
          )}
        </div>
      )}

      {/* Operações de Risco */}
      <div style={{ background: C.card, border: `2px solid ${C.red}`, borderRadius: "12px", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Database size={20} color={C.red} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.red }}>
            Operações de Risco
          </h2>
        </div>
        
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: C.muted, marginBottom: "12px" }}>
            🆕 Limpar base de dados mantendo apenas os últimos 3 dias. Backup automático será baixado.
          </div>
          
          <button
            onClick={clearDatabase}
            disabled={clearing}
            style={{
              padding: "12px 24px",
              background: clearing ? C.gray : C.red,
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: clearing ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              width: "100%"
            }}
          >
            {clearing ? '⏳ Limpando...' : '🗑️ Limpar Base (Últimos 3 Dias)'}
          </button>
        </div>
      </div>

      </div>
    </div>
  );
}
