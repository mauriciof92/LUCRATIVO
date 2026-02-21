"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBacktest } from "../../hooks/useBacktest";
import { NavHeader } from "../../components/NavHeader";
import { Settings, Database, Trash2, Upload, Key, AlertTriangle } from "lucide-react";

const C = {
  bg: "#0a0f1f",
  card: "#1e293b", 
  border: "#374151",
  accent: "#3b82f6",
  green: "#10b981",
  red: "#ef4444", 
  yellow: "#f59e0b",
  gray: "#6b7280",
  text: "#f9fafb",
  muted: "#9ca3af",
};

export default function AdminPage() {
  const router = useRouter();
  const {
    file,
    loading,
    results,
    err,
    
    // Funções do hook
    handleImport,
    handleClear,
    handleEnrich,
    syncMissingResults,
    setFile,
    
    // Componentes do hook
    KPI,
  } = useBacktest();

  // 🆕 Estados locais para Admin
  const [apiKey, setApiKey] = useState("");
  const [clearing, setClearing] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // 🆕 Detectar se está no cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

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
          <KPI label="Total de Jogos" value={String(stats.totalGames)} />
          <KPI label="Jogos Hoje" value={String(stats.todayGames)} color={stats.todayGames > 0 ? C.green : C.gray} />
          <KPI label="Jogos Elite ⭐" value={String(stats.eliteGames)} color={C.yellow} />
          <KPI label="Dados Pendentes" value={String(stats.pendingData)} color={stats.pendingData > 0 ? C.yellow : C.green} />
        </div>
      </div>

      {/* Upload de CSV */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Upload size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Importar CSV
          </h2>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{
              padding: "8px 12px",
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "6px",
              color: C.text,
              fontSize: "14px"
            }}
          />
          
          <button
            onClick={handleImport}
            disabled={!file || loading}
            style={{
              padding: "8px 16px",
              background: loading ? C.gray : C.green,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            {loading ? "Processando..." : "🚀 Importar"}
          </button>
        </div>
        
        {err && (
          <div style={{
            padding: "12px",
            background: "#450a0a",
            border: `1px solid ${C.red}`,
            borderRadius: "6px",
            color: C.red,
            fontSize: "13px"
          }}>
            ⚠️ {err}
          </div>
        )}
      </div>

      {/* Processamento de Dados */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Database size={20} color={C.accent} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
            Processamento de Dados
          </h2>
        </div>
        
        {/* Fluxo diário recomendado */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Fluxo diário recomendado:</strong><br/>
          1. <strong>Importar CSV</strong> (acima) com os jogos do dia<br/>
          2. <strong>Enriquecer Dados</strong> — busca placares e stats reais via API-Football<br/>
          3. <strong>Sincronizar Dados</strong> — preenche chutes/cantos HT faltantes para resolver Finalizações
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            title="Busca resultados reais (placares, gols) via API-Football para todos os jogos no banco que ainda não têm dados"
            onClick={handleEnrich}
            disabled={results.length === 0}
            style={{
              padding: "8px 16px",
              background: results.length === 0 ? C.gray : C.yellow,
              color: results.length === 0 ? C.muted : C.bg,
              border: "none",
              borderRadius: "6px",
              cursor: results.length === 0 ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600
            }}
          >
            🎯 Enriquecer Dados
          </button>
          
          <button
            title="Busca dados de chutes e cantos do 1º tempo (HT) para jogos que possuem mercados HT mas ainda sem stats reais"
            onClick={syncMissingResults}
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
            🔄 Sincronizar Dados
          </button>
        </div>
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
                  {isClient && localStorage.getItem("football-api-key") ? "••••••••••••••••" : "Carregando..."}
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
