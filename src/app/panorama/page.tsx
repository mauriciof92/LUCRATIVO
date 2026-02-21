"use client";

import { useState, useEffect } from "react";
import { useBacktest } from "../../hooks/useBacktest";
import { TrendingUp, Target, Wallet, Calendar, Star, AlertCircle, Trophy, Zap } from "lucide-react";

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
  elite: "#fbbf24",
  purple: "#9333ea",
};

// 🆕 STAKE FIXA R$ 25,00 PARA TODOS OS CÁLCULOS
const STAKE_FIXA = 25.00;

export default function PanoramaPage() {
  const {
    results,
    loading,
    err,
    summary,
    
    // Funções do hook
    syncMissingResults,
    
    // Componentes do hook
    KPI,
    mktCat,
  } = useBacktest();

  // 🆕 Estados locais para Panorama
  const [todayProfit, setTodayProfit] = useState(0);
  const [eliteOpportunities, setEliteOpportunities] = useState(0);
  const [bankrollStatus, setBankrollStatus] = useState(0);
  const [last7DaysSummary, setLast7DaysSummary] = useState<any>(null);
  const [topMultiples, setTopMultiples] = useState<any[]>([]);

  // 🆕 Calcular KPIs do Panorama com STAKE FIXA R$ 25,00
  useEffect(() => {
    if (results.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const todayResults = results.filter(r => {
      const resultDate = r.hour?.split(' ')[0] || '';
      return resultDate === today;
    });

    // Lucro Hoje com STAKE FIXA R$ 25,00
    const todayProfitCalc = todayResults.reduce((profit, r) => {
      const won = r.mainMarket.result === "win";
      const odd = r.mainMarket.odd || 1;
      return profit + (won ? (STAKE_FIXA * (odd - 1)) : -STAKE_FIXA);
    }, 0);
    setTodayProfit(todayProfitCalc);

    // 🆕 Oportunidades Elite (Blitz Score > 75)
    const eliteGames = results.filter(r => (r.score || 0) > 75);
    setEliteOpportunities(eliteGames.length);

    // Status da Banca com STAKE FIXA R$ 25,00
    const totalProfit = results.reduce((profit, r) => {
      const won = r.mainMarket.result === "win";
      const odd = r.mainMarket.odd || 1;
      return profit + (won ? (STAKE_FIXA * (odd - 1)) : -STAKE_FIXA);
    }, 0);
    setBankrollStatus(1000 + totalProfit); // Bankroll inicial de R$ 1000

    // Sumário Últimos 7 dias com STAKE FIXA R$ 25,00
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentResults = results.filter(r => {
      const resultDate = new Date(r.hour?.split(' ')[0] || '');
      return resultDate >= sevenDaysAgo;
    });

    const wins = recentResults.filter(r => r.mainMarket.result === "win").length;
    const total = recentResults.length;
    const hitRate = total > 0 ? (wins / total) * 100 : 0;
    const profit7Days = recentResults.reduce((profit, r) => {
      const won = r.mainMarket.result === "win";
      const odd = r.mainMarket.odd || 1;
      return profit + (won ? (STAKE_FIXA * (odd - 1)) : -STAKE_FIXA);
    }, 0);

    setLast7DaysSummary({
      totalBets: total,
      hitRate: hitRate.toFixed(1),
      profit: profit7Days,
      eliteGames: recentResults.filter(r => (r.score || 0) > 75).length
    });

    // 🆕 Gerar Top 3 Múltiplas
    generateTopMultiples(eliteGames);

  }, [results]);

  // 🆕 Gerar Top 3 Múltiplas para hoje com Confiança > 55%
  const generateTopMultiples = (eliteGames: any[]) => {
    if (eliteGames.length < 2) {
      setTopMultiples([]);
      return;
    }

    const multiples = [];
    
    // Gerar combinações de 2 jogos (Duplas)
    for (let i = 0; i < Math.min(eliteGames.length, 3); i++) {
      for (let j = i + 1; j < Math.min(eliteGames.length, 4); j++) {
        const game1 = eliteGames[i];
        const game2 = eliteGames[j];
        
        const odd1 = game1.mainMarket.odd || 1.8;
        const odd2 = game2.mainMarket.odd || 1.8;
        const combinedOdd = odd1 * odd2;
        
        // Calcular probabilidade baseada no score
        const prob1 = (game1.score || 0) / 100;
        const prob2 = (game2.score || 0) / 100;
        const confidence = (prob1 + prob2) / 2;
        
        // 🆕 CONFIANÇA > 55% (ajustado de 65%)
        if (confidence > 0.55 && combinedOdd > 2.5) {
          multiples.push({
            id: `multiple_${i}_${j}`,
            type: combinedOdd > 4.0 ? "Tripla" : "Dupla",
            games: [game1, game2],
            combinedOdd: combinedOdd.toFixed(2),
            confidence: (confidence * 100).toFixed(1),
            expectedReturn: (STAKE_FIXA * combinedOdd).toFixed(2),
            stake: STAKE_FIXA
          });
        }
      }
    }

    // Ordenar por confiança e pegar as top 3
    const sortedMultiples = multiples
      .sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence))
      .slice(0, 3);
    
    setTopMultiples(sortedMultiples);
  };

  const hasTodayGames = results.some(r => {
    const today = new Date().toISOString().split('T')[0];
    const resultDate = r.hour?.split(' ')[0] || '';
    return resultDate === today;
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "20px", fontFamily: "Inter, system-ui, sans-serif" }}>
      
      {/* Header Minimalista */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Trophy size={32} color={C.elite} />
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 700, margin: 0, color: C.text }}>
              Scanner Elite
            </h1>
            <p style={{ margin: "4px 0 0 0", color: C.muted, fontSize: "14px" }}>
              Oportunidades ⭐ · Múltiplas Prontas
            </p>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={syncMissingResults}
            style={{
              padding: "8px 16px",
              background: C.green,
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            🔄 Sincronizar
          </button>
        </div>
      </div>

      {/* 🆕 TOP 3 MÚLTIPLAS DO DIA */}
      {topMultiples.length > 0 && (
        <div style={{ background: C.card, border: `2px solid ${C.elite}`, borderRadius: "12px", padding: "24px", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <Zap size={24} color={C.elite} />
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: C.elite }}>
              Top 3 Múltiplas Prontas
            </h2>
          </div>
          
          <div style={{ display: "grid", gap: "16px" }}>
            {topMultiples.map((multiple, index) => (
              <div key={multiple.id} style={{
                background: `linear-gradient(135deg, ${C.elite}10, transparent)`,
                border: `1px solid ${C.elite}`,
                borderRadius: "10px",
                padding: "16px",
                position: "relative"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: C.text, marginBottom: "4px" }}>
                      {multiple.type} #{index + 1}
                    </div>
                    <div style={{ fontSize: "12px", color: C.muted }}>
                      Confiança: {multiple.confidence}% · Odd: {multiple.combinedOdd}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: C.green }}>
                      R$ {multiple.expectedReturn}
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted }}>
                      Retorno (R$ {multiple.stake})
                    </div>
                  </div>
                </div>
                
                <div style={{ display: "grid", gap: "8px" }}>
                  {multiple.games.map((game: any, gameIndex: number) => (
                    <div key={gameIndex} style={{
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontSize: "12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: C.text, fontWeight: 500 }}>{game.match}</span>
                        <span style={{ color: C.elite }}>⭐ {(game.score || 0).toFixed(1)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                        <span style={{ color: C.muted }}>{game.mainMarket.label}</span>
                        <span style={{ color: C.green }}>{(game.mainMarket.odd || 1).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs Principais com STAKE FIXA R$ 25,00 */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
        gap: "20px", 
        marginBottom: "32px" 
      }}>
        
        {/* Lucro Hoje */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "24px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ 
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: todayProfit >= 0 ? `${C.green}20` : `${C.red}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Wallet size={20} color={todayProfit >= 0 ? C.green : C.red} />
          </div>
          
          <div style={{ marginBottom: "8px" }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Lucro Hoje</div>
            <div style={{ 
              fontSize: "32px", 
              fontWeight: 700, 
              color: todayProfit >= 0 ? C.green : C.red 
            }}>
              {todayProfit >= 0 ? "+" : ""}R$ {todayProfit.toFixed(2)}
            </div>
          </div>
          
          <div style={{ fontSize: "11px", color: C.muted }}>
            {hasTodayGames ? "Jogos do dia processados" : "Nenhum jogo hoje"}
          </div>
        </div>

        {/* Oportunidades Elite */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "24px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ 
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: `${C.elite}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Star size={20} color={C.elite} />
          </div>
          
          <div style={{ marginBottom: "8px" }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Oportunidades Elite ⭐</div>
            <div style={{ 
              fontSize: "32px", 
              fontWeight: 700, 
              color: C.elite 
            }}>
              {eliteOpportunities}
            </div>
          </div>
          
          <div style={{ fontSize: "11px", color: C.muted }}>
            Jogos com Blitz Score maior que 75
          </div>
        </div>

        {/* Status da Banca */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "24px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ 
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: `${C.accent}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Target size={20} color={C.accent} />
          </div>
          
          <div style={{ marginBottom: "8px" }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Status da Banca</div>
            <div style={{ 
              fontSize: "32px", 
              fontWeight: 700, 
              color: C.text 
            }}>
              R$ {bankrollStatus.toFixed(2)}
            </div>
          </div>
          
          <div style={{ fontSize: "11px", color: C.muted }}>
            Stake fixa: R$ {STAKE_FIXA.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Sumário Últimos 7 Dias (se não houver jogos hoje) */}
      {!hasTodayGames && last7DaysSummary && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <Calendar size={20} color={C.accent} />
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
              Últimos 7 Dias
            </h2>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Total de Apostas</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: C.text }}>
                {last7DaysSummary.totalBets}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Hit Rate</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: C.accent }}>
                {last7DaysSummary.hitRate}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Lucro/Prejuízo</div>
              <div style={{ 
                fontSize: "24px", 
                fontWeight: 700, 
                color: last7DaysSummary.profit >= 0 ? C.green : C.red 
              }}>
                {last7DaysSummary.profit >= 0 ? "+" : ""}R$ {last7DaysSummary.profit.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Jogos Elite</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: C.elite }}>
                {last7DaysSummary.eliteGames} ⭐
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Jogos Elite Recentes */}
      {results.filter(r => (r.score || 0) > 75).length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <Star size={20} color={C.elite} />
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
              Oportunidades Elite ⭐
            </h2>
          </div>
          
          <div style={{ display: "grid", gap: "12px" }}>
            {results
              .filter(r => (r.score || 0) > 75)
              .slice(0, 5)
              .map((result, index) => (
                <div key={result.id} style={{
                  background: `linear-gradient(135deg, ${C.elite}10, transparent)`,
                  border: `2px solid ${C.elite}`,
                  borderRadius: "8px",
                  padding: "16px",
                  boxShadow: `0 0 20px ${C.elite}40`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: C.text, marginBottom: "4px" }}>
                        {result.match}
                      </div>
                      <div style={{ fontSize: "12px", color: C.muted }}>
                        {result.league}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: C.elite }}>
                        ⭐ {result.score?.toFixed(1)}
                      </div>
                      <div style={{ fontSize: "11px", color: C.muted }}>
                        Blitz Score
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                    <span style={{ color: C.accent, fontWeight: 500 }}>
                      {result.mainMarket.label}
                    </span>
                    <span style={{ 
                      color: result.mainMarket.result === "win" ? C.green : 
                             result.mainMarket.result === "lose" ? C.red : C.muted 
                    }}>
                      {result.mainMarket.result === "win" ? "✅ Verde" : 
                       result.mainMarket.result === "lose" ? "❌ Vermelho" : "—"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
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
            Carregando Scanner...
          </h3>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Buscando oportunidades ⭐
          </p>
        </div>
      )}

      {/* Error State */}
      {err && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.red}`,
          borderRadius: "12px",
          padding: "20px",
          textAlign: "center",
          color: C.red
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "12px" }}>
            <AlertCircle size={24} color={C.red} />
            <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.red }}>
              Erro ao carregar dados
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "14px" }}>
            {err}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !err && results.length === 0 && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          padding: "60px 20px",
          textAlign: "center",
          color: C.muted
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏆</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px 0", color: C.text }}>
            Scanner Pronto
          </h3>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Importe dados na aba <strong>Admin</strong> para começar a escanear
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
