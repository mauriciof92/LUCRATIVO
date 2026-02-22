"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBacktest } from "../../hooks/useBacktest";
import { NavHeader } from "../../components/NavHeader";
import { Settings, Database, Trash2, Upload, Key, AlertTriangle } from "lucide-react";

import { C, KPI as SharedKPI } from "../../components/ui";

export default function AdminPage() {
  const router = useRouter();
  const {
    file,
    loading,
    results,
    err,
    saveError,
    
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

  // 🆕 Handler de processamento completo
  const handleProcessar = async () => {
    if (!csvFile) return;
    setProcessing(true);
    try {
      // a) Parse + save via hook (retorna count de jogos importados)
      const saved = await importFromCSV(csvFile);
      // b) Buscar odds (já existente)
      const apiKey = localStorage.getItem('football-api-key') ?? '';
      let withOdds = 0;
      if (apiKey) {
        withOdds = await enrichWithOdds(apiKey);
      }
      setProcessResult({ saved, withOdds });
    } finally {
      setProcessing(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm("⚠️ ATENÇÃO: Isso apagará TODOS os dados do banco. Continuar?")) {
      return;
    }
    
    setClearing(true);
    try {
      // TODO: Implementar limpeza do Supabase
      console.log("[ADMIN] Limpando banco de dados...");
      await handleClear();
    } catch (error) {
      console.error("[ADMIN] Erro ao limpar banco:", error);
    } finally {
      setClearing(false);
    }
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
          onClick={handleProcessar}
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

      {/* Operações de Risco */}
      <div style={{ background: C.card, border: `2px solid ${C.red}`, borderRadius: "12px", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <AlertTriangle size={20} color={C.red} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.red }}>
            Operações de Risco
          </h2>
        </div>
        
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: C.muted, marginBottom: "12px" }}>
            ⚠️ Estas operações são irreversíveis e afetarão todos os dados do sistema.
          </div>
          
          <button
            onClick={handleClearDatabase}
            disabled={clearing}
            style={{
              padding: "8px 16px",
              background: clearing ? C.gray : C.red,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: clearing ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Trash2 size={16} />
            {clearing ? "Limpando..." : "🗑️ Limpar Banco de Dados"}
          </button>
        </div>
      </div>

      </div>
    </div>
  );
}
