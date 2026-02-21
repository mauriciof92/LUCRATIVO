"use client";

import { useState } from "react";
import { useBacktest } from "../../hooks/useBacktest";
import { loadStoredBacktest, exportStoredBacktestAsJSON, clearStoredBacktest } from "../../lib/storage";
import { NavHeader } from "../../components/NavHeader";

const C = {
  bg:"#0a0f1f", card:"#1e293b", border:"#374151", accent:"#3b82f6",
  green:"#10b981", red:"#ef4444", yellow:"#f59e0b", gray:"#6b7280",
  text:"#f9fafb", muted:"#9ca3af",
  // 🆕 TAREFA 5.1: Cores premium para mercados de elite
  elite: "#fbbf24", // Dourado para Finalizações HT
  purple: "#9333ea", // Roxo profissional
};

export default function BacktestPage() {
  // 🆕 TAREFA 1.4: Usar hook useBacktest para 100% da lógica
  const {
    // Estados do hook
    file,
    loading,
    results,
    summary,
    history,
    err,
    showTable,
    filter,
    enriching,
    reqUsed,
    enrichErr,
    manualInputs,
    
    // Setters do hook
    setFile,
    setFilter,
    
    // Funções do hook
    handleImport,
    handleClear,
    handleEnrich,
    handleManualInput,
    handleManualConfirm,
    syncMissingResults,
    
    // Cálculos derivados do hook
    mktStats,
    totalG,
    totalAvg,
    totalR,
    totalV,
    hitRate,
    hitRateInclAvg,
    filtered,
    
    // Componentes do hook
    Badge,
    KPI,
    TH,
    TD,
    mktCat,
  } = useBacktest();

  // 🆕 TAREFA 1.4:// 🆕 FUNÇÃO PARA ESTILO DE JOGOS ELITE
  const getEliteRowStyle = (result: any) => {
    const isElite = (result.score || 0) > 75;
    if (!isElite) return {};
  
    return {
      background: `linear-gradient(135deg, ${C.elite}10, transparent)`,
      border: `1px solid ${C.elite}`,
      boxShadow: `0 0 10px ${C.elite}20`
    };
  };

  // 🆕 TAREFA 1.4:// 🆕 ESTADO PARA MENU SUSPENSO
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const getDynamicLabel = (label: string) => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('finalizac') || lowerLabel.includes('chute')) {
      return 'Chutes no Alvo';
    }
    if (lowerLabel.includes('canto') || lowerLabel.includes('escanteio')) {
      return 'Cantos';
    }
    return label;
  };

  // 🆕 TAREFA 1.4: Funções auxiliares que ainda precisam existir no page.tsx
  const handleClearStorage = async () => { 
    await clearStoredBacktest(); 
  };

  const handleExport = async () => {
    try {
      const stored = await loadStoredBacktest();
      if (stored) {
        exportStoredBacktestAsJSON();
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const handleSyncAll = async () => {
    await syncMissingResults();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: C.text, fontFamily: "Inter, system-ui, sans-serif" }}>

      <NavHeader activePage="/backtest" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div className="backtest-page-content" style={{ padding: "40px" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>🧪 Backtest Engine</h1>
        <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>Análise histórica e validação de estratégias</p>
      </div>

      {/* Upload Section - Fluxo Unificado */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 16px 0", color: C.text }}>
          📁 Processamento de Dados
        </h2>
        
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
          
          {/* 🆕 BOTÃO ÚNICO "AÇÕES" COM MENU SUSPENSO */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
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
              ⚙️ Ações
            </button>
            
            {showActionsMenu && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: "0",
                marginTop: "4px",
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                zIndex: 1000,
                minWidth: "160px"
              }}>
                <button
                  onClick={() => { handleEnrich(); setShowActionsMenu(false); }}
                  disabled={enriching || results.length === 0}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    color: C.text,
                    border: "none",
                    cursor: enriching || results.length === 0 ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    textAlign: "left",
                    borderBottom: `1px solid ${C.border}`
                  }}
                >
                  🎯 Enriquecer Dados
                </button>
                
                <button
                  onClick={() => { syncMissingResults(); setShowActionsMenu(false); }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    color: C.text,
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    textAlign: "left",
                    borderBottom: `1px solid ${C.border}`
                  }}
                >
                  🔄 Sincronizar
                </button>
                
                <button
                  onClick={() => { handleExport(); setShowActionsMenu(false); }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    color: C.text,
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    textAlign: "left",
                    borderBottom: `1px solid ${C.border}`
                  }}
                >
                  📥 Exportar JSON
                </button>
                
                <button
                  onClick={() => { handleClear(); setShowActionsMenu(false); }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    color: C.red,
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    textAlign: "left"
                  }}
                >
                  🗑️ Limpar Tudo
                </button>
              </div>
            )}
          </div>
        </div>
        
        {err && (
          <div style={{
            marginTop: "12px",
            padding: "8px 12px",
            background: "#450a0a",
            border: `1px solid ${C.red}`,
            borderRadius: "6px",
            color: C.red,
            fontSize: "13px"
          }}>
            ⚠️ {err}
          </div>
        )}
        
        {enrichErr && (
          <div style={{
            marginTop: "12px",
            padding: "8px 12px",
            background: "#451a03",
            border: `1px solid ${C.yellow}`,
            borderRadius: "6px",
            color: C.yellow,
            fontSize: "13px"
          }}>
            ⚠️ {enrichErr}
          </div>
        )}
        
        {reqUsed > 0 && (
          <div style={{
            marginTop: "8px",
            fontSize: "12px",
            color: C.muted
          }}>
            📊 API requests usadas: {reqUsed}
          </div>
        )}
      </div>

      {/* KPIs */}
      {summary && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: "16px", 
          marginBottom: "24px" 
        }}>
          <KPI label="Total de Apostas" value={String(summary.totalBets || 0)} />
          <KPI label="ROI Acumulado" value={`${(summary.roi || 0).toFixed(1)}%`} color={summary.roi >= 0 ? C.green : C.red} />
          <KPI label="Hit Rate" value={`${(summary.hitRate || 0).toFixed(1)}%`} color={C.accent} />
          <KPI label="Profit/Loss" value={`R$ ${(summary.totalProfit || 0).toFixed(2)}`} color={summary.totalProfit >= 0 ? C.green : C.red} />
        </div>
      )}

      {/* Filtros */}
      {results.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", color: C.muted, fontWeight: 600 }}>Filtrar:</span>
            {(["all", "win", "lose", "no-odd"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  background: filter === f ? C.accent : "transparent",
                  color: filter === f ? "white" : C.muted,
                  border: `1px solid ${filter === f ? C.accent : C.border}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500
                }}
              >
                {f === "all" ? "Todos" : f === "win" ? "✅ Verde" : f === "lose" ? "❌ Vermelho" : "— Void"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats por Mercado */}
      {Object.keys(mktStats).length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 16px", color: C.text }}>
            📈 Acerto por Mercado
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Mercado", "Total", "✅ Verde", "📊 Média", "❌ Vermelho", "— Void", "Hit Rate", "Hit Rate (+📊)"].map(h => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(mktStats).map(([cat, d]: [string, any], i) => (
                  <tr key={cat} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <TD><span style={{ color: C.text, fontWeight: 500 }}>{cat}</span></TD>
                    <TD><span style={{ color: C.muted }}>{d.total}</span></TD>
                    <TD><span style={{ color: C.green, fontWeight: 600 }}>{d.w}</span></TD>
                    <TD><span style={{ color: "#818cf8", fontWeight: 600 }}>{d.a}</span></TD>
                    <TD><span style={{ color: C.red, fontWeight: 600 }}>{d.l}</span></TD>
                    <TD><span style={{ color: C.gray }}>{d.v}</span></TD>
                    <TD>{d.hit >= 0 ? <span style={{ fontWeight: 700, color: d.hit >= 60 ? C.green : d.hit >= 45 ? C.yellow : C.red }}>{d.hit.toFixed(1)}%</span> : <span style={{ color: C.gray }}>n/a</span>}</TD>
                    <TD>{d.hitAvg >= 0 ? <span style={{ fontWeight: 700, color: d.hitAvg >= 60 ? C.green : d.hitAvg >= 45 ? C.yellow : C.red }}>{d.hitAvg.toFixed(1)}%</span> : <span style={{ color: C.gray }}>n/a</span>}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela de Resultados */}
      {results.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: C.text }}>
              🎲 Resultados ({filtered.length})
            </h2>
            {/* Botão remover - showTable controlado pelo hook */}
          </div>

          {showTable && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr>
                    <TH>Hora</TH>
                    <TH>Liga</TH>
                    <TH>Jogo</TH>
                    <TH>Placar</TH>
                    <TH>Perfil</TH>
                    <TH>Score</TH>
                    <TH>Mercado Principal</TH>
                    <TH>Status</TH>
                    <TH>🎯 Real HT</TH>
                    <TH>🚩 Real Cantos HT</TH>
                    <TH>Combo</TH>
                    <TH>Status Combo</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={r.id} style={{
                      borderBottom: `1px solid ${C.border}20`,
                      ...getEliteRowStyle(r),
                      ...(r.poison?.isPoison ? {
                        background: `linear-gradient(135deg, ${r.poison.primaryTrigger?.color || C.elite}08, transparent)`,
                        borderLeft: `3px solid ${r.poison.primaryTrigger?.color || C.elite}`,
                        boxShadow: `inset 0 0 40px ${r.poison.primaryTrigger?.color || C.elite}06`,
                      } : {}),
                    }}>
                      <TD style={{ color: C.muted, whiteSpace: "nowrap" }}>
                        {(r.hour || "").slice(11, 16) || r.hour || "—"}
                      </TD>
                      <TD style={{ color: C.muted, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.league}
                      </TD>
                      <TD style={{ color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {r.match}
                          {r.poison?.isPoison && r.poison.triggers.map((t: any, ti: number) => (
                            <span key={ti} title={t.reason} style={{
                              background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}60`,
                              borderRadius: "3px", padding: "1px 5px", fontSize: "9px", fontWeight: 800,
                              letterSpacing: "0.5px", cursor: "help", whiteSpace: "nowrap",
                            }}>
                              {t.icon} {t.tag}
                            </span>
                          ))}
                        </div>
                      </TD>
                      <TD style={{ color: C.yellow, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                        {r.resultHome ?? '?'} – {r.resultAway ?? '?'}
                      </TD>
                      <TD>
                        <span style={{ background: "#1e3a5f", color: C.accent, borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.profile}
                        </span>
                      </TD>
                      <TD style={{ color: C.muted, textAlign: "center" }}>
                        {typeof r.score === "number" ? r.score.toFixed(2) : "—"}
                      </TD>
                      <TD style={{ color: C.text, maxWidth: 280, overflow: "visible", textOverflow: "visible", whiteSpace: "normal", padding: "8px 10px" }}>
                        <div style={{
                          // 🆕 TAREFA 5.1: Destaque visual para Finalizações HT (mercados de elite)
                          border: mktCat(r.mainMarket.label) === 'Finalizações HT' ? `2px solid ${C.elite}` : 'none',
                          borderRadius: '6px',
                          padding: '6px',
                          background: mktCat(r.mainMarket.label) === 'Finalizações HT' ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(147, 51, 234, 0.05))' : 'transparent',
                          boxShadow: mktCat(r.mainMarket.label) === 'Finalizações HT' ? `0 0 12px rgba(251, 191, 36, 0.3)` : 'none'
                        }}>
                          <div style={{ 
                            color: mktCat(r.mainMarket.label) === 'Finalizações HT' ? C.elite : C.text,
                            fontWeight: mktCat(r.mainMarket.label) === 'Finalizações HT' ? 600 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            {r.mainMarket.label}
                            {mktCat(r.mainMarket.label) === 'Finalizações HT' && <span style={{ fontSize: '10px' }}>⭐</span>}
                          </div>
                        </div>
                        
                        {/* 🆕 Exibir DADOS REAIS obrigatoriamente para validação */}
                        {(r.actualTotalShotsHT !== undefined) && (
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2, background: "#1a1a1a", padding: "4px 6px", borderRadius: 3, lineHeight: "1.2" }}>
                            <span style={{ color: C.yellow }}>🎯 Real HT:</span> {r.actualTotalShotsHT} chutes
                          </div>
                        )}
                        {(r.actualTotalCornersHT !== undefined) && (
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2, background: "#1a1a1a", padding: "4px 6px", borderRadius: 3, lineHeight: "1.2" }}>
                            <span style={{ color: C.yellow }}>🚩 Real HT:</span> {r.actualTotalCornersHT} cantos
                          </div>
                        )}
                        {/* Alerta se dados ausentes */}
                        {r.mainMarket.result === "pending_manual" && (
                          <div style={{ fontSize: 10, color: C.red, marginTop: 2, background: "#2a1a1a", padding: "4px 6px", borderRadius: 3, lineHeight: "1.2" }}>
                            ⚠️ Dados HT ausentes
                          </div>
                        )}
                      </TD>
                      <TD style={{ position: 'relative', minWidth: '200px' }}>
                        <Badge result={r.mainMarket.result as any} />
                        
                        {/* Se não tiver dados HT OU for pending_manual, exibe o painel de input */}
                        {r.mainMarket.result === "pending_manual" ? (
                          <div style={{
                            marginTop: "12px",
                            background: "#2a1a1a",
                            padding: "12px",
                            borderRadius: "6px",
                            border: "1px solid #450a0a",
                            zIndex: 10,
                            position: "relative"
                          }}>
                            <div style={{ fontSize: "11px", color: C.yellow, marginBottom: "8px", fontWeight: 600 }}>
                              ⚠️ Dados ausentes. Inserir valor real:
                            </div>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <input
                                  type="number"
                                  placeholder="Valor"
                                  value={manualInputs[`${String(r.id)}_shots`] || ''}
                                  onChange={(e) => handleManualInput(`${String(r.id)}_shots`, e.target.value, true)}
                                  style={{
                                    flex: 1,
                                    padding: "6px",
                                    fontSize: "12px",
                                    background: "#1a1a1a",
                                    border: `1px solid ${C.border}`,
                                    color: C.text,
                                    borderRadius: "4px",
                                    outline: "none"
                                  }}
                                />
                                <span style={{ fontSize: "11px", color: C.muted }}>
                                  {getDynamicLabel(r.mainMarket.label)}
                                </span>
                              </div>
                              
                              <button
                                onClick={() => handleManualConfirm(
                                  `${String(r.id)}_shots`,
                                  r.mainMarket.label, 
                                  mktCat(r.mainMarket.label) === 'Finalizações HT'
                                )}
                                style={{
                                  padding: "6px 12px",
                                  background: C.green,
                                  color: C.bg,
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: 600
                                }}
                              >
                                ✅ Confirmar
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </TD>
                      <TD style={{ color: C.muted, whiteSpace: "nowrap" }}>
                        {r.combo.length > 0 ? r.combo.map((c: any) => (
                          <div key={c.label} style={{ fontSize: "11px", marginBottom: "2px" }}>
                            {c.label}
                          </div>
                        )) : "—"}
                      </TD>
                      <TD>
                        {r.combo.length > 0 ? r.combo.map((c: any, idx: number) => (
                          <Badge key={idx} result={c.result as any} />
                        )) : <Badge result="no-odd" />}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "60px 20px",
          textAlign: "center",
          color: C.muted
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px 0", color: C.text }}>
            Nenhum dado encontrado
          </h3>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Importe um arquivo CSV para começar a análise
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "60px 20px",
          textAlign: "center",
          color: C.muted
        }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "3px solid " + C.border, 
            borderTop: "3px solid " + C.accent, 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px"
          }} />
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px 0", color: C.text }}>
            Processando...
          </h3>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Analisando dados do CSV
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .backtest-page-content { padding: 16px !important; }
        }
      `}</style>
      </div>
    </div>
  );
}
