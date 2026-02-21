"use client";

import { useState } from "react";
import { analyzePreLiveMultiples, LiveMultipleSuggestion, PreLiveMultipleAnalyzer } from "../../lib/pre-live-multiple-analyzer";
import type { PreMatchOdds } from "../../lib/footballApi";

export default function PreLiveMultiplePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [results, setResults] = useState<{
    suggestions: LiveMultipleSuggestion[];
    summary: any;
  } | null>(null);
  const [csvText, setCsvText] = useState<string>(""); // Store CSV text for odds fetching

  const prettyMarketLabel = (raw: string) => {
    const s = String(raw ?? "").trim();
    if (!s) return s;

    const parts = s.split("+").map(p => p.trim());
    const prettyPart = (p: string) => {
      let x = p;
      x = x.replace(/^over\s+(\d+(?:[.,]\d+)?)\s*ft$/i, "⚽ Over $1 Gols FT (Total)");
      x = x.replace(/^under\s+(\d+(?:[.,]\d+)?)\s*ft$/i, "⚽ Under $1 Gols FT (Total)");
      x = x.replace(/^over\s+(\d+(?:[.,]\d+)?)\s*ht$/i, "⏱️ Over $1 Gols HT (1º tempo)");
      x = x.replace(/^under\s+(\d+(?:[.,]\d+)?)\s*ht$/i, "⏱️ Under $1 Gols HT (1º tempo)");
      x = x.replace(/^over\s+(\d+(?:[.,]\d+)?)\s*cantos\s*ft$/i, "🚩 Over $1 Cantos FT (Total)");
      x = x.replace(/^over\s+(\d+(?:[.,]\d+)?)\s*cantos\s*ht$/i, "🚩 Over $1 Cantos HT (1º tempo)");
      x = x.replace(/\bambas\s+marcam\b.*\bsim\b/i, "💜 Ambas Marcam (BTTS) — Sim");
      x = x.replace(/\bambas\s+marcam\b/i, "💜 Ambas Marcam (BTTS)");
      return x;
    };

    return parts.map(prettyPart).join(" + ");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      setCsvText(text); // Store for odds fetching
      const analysis = analyzePreLiveMultiples(text);
      setResults(analysis);
    } catch (err) {
      console.error("Erro na análise pré-live:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchOdds = async () => {
    if (!csvText) return;
    setLoadingOdds(true);
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch odds from API
      const oddsResponse = await fetch(`/api/football-odds?date=${today}`);
      if (!oddsResponse.ok) {
        throw new Error('Failed to fetch odds');
      }
      const oddsData = await oddsResponse.json();
      
      // Re-analyze with real odds
      const analyzer = PreLiveMultipleAnalyzer.getInstance();
      const analysis = analyzer.analyzeLiveMultiples(csvText, oddsData.oddsMap, oddsData.fixtureMap);
      setResults(analysis);
      
      console.log(`[ODDS] Fetched odds for ${Object.keys(oddsData.oddsMap).length} fixtures, ${oddsData.reqUsed} API calls`);
    } catch (err) {
      console.error("Erro ao buscar odds:", err);
      alert('Erro ao buscar odds. Verifique o console.');
    } finally {
      setLoadingOdds(false);
    }
  };

  const getConfidenceColor = (c: number) =>
    c >= 0.85 ? "var(--success)" : c >= 0.75 ? "var(--warning)" : c >= 0.65 ? "#ff9100" : "var(--error)";

  const getRiskRewardColor = (rr: string) => {
    switch (rr) {
      case "Excelente": return "var(--success)";
      case "Bom": return "#4caf50";
      case "Moderado": return "#ff9100";
      case "Alto": return "var(--error)";
      default: return "var(--text-muted)";
    }
  };

  return (
    <main className="app-shell">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">🎯 Pré-Live Múltiplas</h1>
        <div className="app-subtitle">
          Múltiplas inteligentes ANTES dos jogos começarem
        </div>
        <nav className="nav-links">
          <a href="/" className="nav-link">🏠 Home</a>
          <a href="/pre-live-multiple" className="nav-link active">⚡ Pré-Live Múltiplas</a>
        </nav>
      </header>

      {/* Upload */}
      <section className="upload-zone" style={{ position: "relative" }}>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          disabled={loading}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", zIndex: 2 }}
        />
        <div className="upload-text" style={{ pointerEvents: "none" }}>
          {file ? `✅ ${file.name}` : "📂 Selecione o CSV do dia"}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
        <button
          className="analyze-btn"
          onClick={handleAnalyze}
          disabled={!file || loading || loadingOdds}
          style={{ flex: 1 }}
        >
          {loading ? "⏳ Analisando..." : "🔍 Analisar Oportunidades"}
        </button>
        
        <button
          className="analyze-btn"
          onClick={handleFetchOdds}
          disabled={!csvText || loading || loadingOdds}
          style={{ 
            flex: 1,
            background: loadingOdds ? '#666' : 'linear-gradient(135deg, #2196F3, #1976D2)',
            border: loadingOdds ? '1px solid #555' : '1px solid #1976D2'
          }}
        >
          {loadingOdds ? "⏳ Buscando..." : "🎲 Buscar Odds Reais"}
        </button>
      </div>

      {results && (
        <>
          {/* Resumo */}
          <div className="prelive-summary" style={{ marginTop: 24 }}>
            <div className="prelive-stat">
              <div className="value">{results.summary.totalGames}</div>
              <div className="label">Jogos</div>
            </div>
            <div className="prelive-stat">
              <div className="value">{results.summary.availableMarkets}</div>
              <div className="label">Mercados</div>
            </div>
            <div className="prelive-stat">
              <div className="value">{results.summary.highValueMarkets}</div>
              <div className="label">Com Valor</div>
            </div>
            <div className="prelive-stat">
              <div className="value">{(results.summary.avgConfidence * 100).toFixed(0)}%</div>
              <div className="label">Confiança Média</div>
            </div>
          </div>

          {/* Sugestões */}
          <div className="section-label" style={{ marginBottom: 16 }}>
            Múltiplas Sugeridas ({results.suggestions.length})
          </div>

          {results.suggestions.map((s) => (
            <div
              key={s.id}
              className={`suggestion-card`}
              style={{ borderLeft: `3px solid ${s.type === "gold" ? "#FFD700" : s.type === "silver" ? "#C0C0C0" : "#CD7F32"}` }}
            >
              {/* Header */}
              <div className="suggestion-header">
                <div className="suggestion-badges">
                  <span className={`badge type-${s.type}`}>
                    {s.type.toUpperCase()}
                  </span>
                  <span className={`badge risk-${s.riskLevel}`}>
                    {s.riskLevel.toUpperCase()}
                  </span>
                  <span className="badge confidence" style={{ color: getConfidenceColor(s.confidence) }}>
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="badge risk-reward" style={{ color: getRiskRewardColor(s.riskReward) }}>
                    {s.riskReward}
                  </span>
                </div>
                <div className="suggestion-odd">
                  <div className="value">{s.combinedOdd.toFixed(2)}</div>
                  <div className="label">Odd combinada</div>
                </div>
              </div>

              {/* Value indicators */}
              <div className="value-indicators">
                <span className={`value-chip ${s.expectedValue > 0 ? "positive" : "negative"}`}>
                  EV: {(s.expectedValue * 100).toFixed(1)}%
                </span>
                <span className="value-chip">
                  {s.selections.filter(sel => sel.hasValue).length}/{s.selections.length} com valor
                </span>
              </div>

              {/* Seleções */}
              <div style={{ marginBottom: 12 }}>
                {s.selections.map((sel, sidx) => (
                  <div key={sidx} className={`selection-item ${sel.hasValue ? "has-value" : ""}`}>
                    <div className="selection-market">
                      {prettyMarketLabel(sel.market)}
                      {sel.hasValue && <span style={{ marginLeft: 6 }}>💎</span>}
                    </div>
                    <div className="selection-match">
                      {sel.match} · {sel.league}
                    </div>
                    <div className="selection-details">
                      <span>
                        Odd: {sel.odd && sel.odd > 1 ? sel.odd.toFixed(2) : "—"}
                        {sel.minOdd && sel.minOdd > 0 ? ` (min: ${sel.minOdd.toFixed(2)})` : ""}
                        {typeof sel.edge === "number" ? ` · Edge: ${sel.edge}%` : ""}
                      </span>
                      <span style={{ color: sel.hasValue ? "var(--success)" : "var(--text-muted)" }}>
                        {sel.recommendation || (sel.hasValue ? "Com valor" : "Sem valor")}
                      </span>
                    </div>
                    <div className="selection-tags">
                      <span className="selection-tag">{sel.gameProfile}</span>
                      <span className="selection-tag">{typeof sel.confidence === 'number' ? `${sel.confidence.toFixed(0)}%` : "—"}</span>
                      <span className={`selection-tag ${sel.hasValue ? 'tag-value' : 'tag-novalue'}`}>
                        {sel.hasValue ? '💎 Valor' : 'Sem valor'}
                      </span>
                      {/* 🆕 Odd quality tag */}
                      {sel.oddTag && (
                        <span className={`selection-tag ${
                          sel.oddTag === 'SEM ODD' ? 'tag-noodd' : 
                          sel.oddTag === 'ODD BAIXA' ? 'tag-lowodd' : ''
                        }`}>
                          {sel.oddTag === 'SEM ODD' ? '🔴 SEM ODD' : '🟠 ODD BAIXA'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="suggestion-footer">
                <div className="footer-item">
                  <div className="label">Stake</div>
                  <div className="value">{s.suggestedStake.toFixed(1)}u</div>
                </div>
                <div className="footer-item">
                  <div className="label">Retorno</div>
                  <div className="value" style={{ color: "var(--success)" }}>
                    {s.expectedReturn.toFixed(2)}u
                  </div>
                </div>
                <div className="footer-item">
                  <div className="label">Risco/Retorno</div>
                  <div className="value" style={{ color: getRiskRewardColor(s.riskReward) }}>
                    {s.riskReward}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
