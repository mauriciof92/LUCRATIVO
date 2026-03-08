"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { NavHeader } from "../../components/NavHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useBacktest, STAKE_FIXA } from "../../hooks/useBacktest";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";
import { C, KPI as KpiCard, EmptyState, mktCat as catLabel } from "../../components/ui";

type Period = 7 | 30 | 90;

export default function Dashboard() {
  const router = useRouter();
  const { results, loading } = useBacktest();
  const [period, setPeriod] = useState<Period>(30);
  const { filtered, confirmed, unresolved, wins, losses, hitRate, totalProfit, roi, roiChart } = useDashboardMetrics(period);

  const byMarket = useMemo(() => {
    const map: Record<string, { wins: number; total: number; profit: number }> = {};
    confirmed.forEach(r => {
      const cat = catLabel(r.mainMarket.label || "");
      if (!map[cat]) map[cat] = { wins: 0, total: 0, profit: 0 };
      map[cat].total++;
      if (r.mainMarket.result === "win") map[cat].wins++;
      map[cat].profit += Number(r.mainMarket.profit || 0);
    });
    return Object.entries(map)
      .map(([market, v]) => ({ market, total: v.total, wins: v.wins, hitRate: v.total > 0 ? (v.wins / v.total * 100) : 0, profit: v.profit, roi: v.total > 0 ? (v.profit / (v.total * STAKE_FIXA) * 100) : 0 }))
      .filter(m => m.total >= 2).sort((a, b) => b.hitRate - a.hitRate);
  }, [confirmed]);

  const byLeague = useMemo(() => {
    const map: Record<string, { wins: number; total: number; profit: number }> = {};
    confirmed.forEach(r => {
      const l = r.league || "Desconhecida";
      if (!map[l]) map[l] = { wins: 0, total: 0, profit: 0 };
      map[l].total++;
      if (r.mainMarket.result === "win") map[l].wins++;
      map[l].profit += Number(r.mainMarket.profit || 0);
    });
    return Object.entries(map)
      .map(([league, v]) => ({
        league, total: v.total, wins: v.wins,
        hitRate: v.total > 0 ? (v.wins / v.total * 100) : 0,
        profit: v.profit, roi: v.total > 0 ? (v.profit / (v.total * STAKE_FIXA) * 100) : 0,
        classificacao: v.total >= 20 && v.wins/v.total >= 0.70 ? " ELITE" : v.total >= 10 && v.wins/v.total >= 0.60 ? " FORTE" : v.total >= 5 && v.wins/v.total >= 0.50 ? " MODERADO" : v.wins/v.total < 0.40 && v.total >= 5 ? " EVITAR" : " NEUTRO",
      }))
      .filter(m => m.total >= 3).sort((a, b) => b.hitRate - a.hitRate);
  }, [confirmed]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif" }}>

      <NavHeader activePage="/dashboard" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: "40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📊 Dashboard Analítico</h1>
            <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>{confirmed.length} apostas confirmadas de {filtered.length} totais</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([7, 30, 90] as Period[]).map(d => (
              <button key={d} onClick={() => setPeriod(d)} style={{
                background: period === d ? C.blue : "transparent",
                color: period === d ? "#000" : C.muted,
                border: `1px solid ${period === d ? C.blue : C.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer",
                fontWeight: period === d ? 700 : 400,
              }}>{d} dias</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
          <KpiCard label="ROI do Período" value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`}
            sub={`Lucro: ${totalProfit >= 0 ? "+" : ""}R$ ${totalProfit.toFixed(2)}`}
            color={roi >= 0 ? C.green : C.red} />
          <KpiCard label="Hit Rate" value={`${hitRate.toFixed(1)}%`}
            sub={`${wins}W / ${losses}L de ${confirmed.length} apostas`}
            color={hitRate >= 60 ? C.green : hitRate >= 45 ? C.gold : C.red} />
          {unresolved.length > 0 && (
            <KpiCard label="Não Resolvidos" value={String(unresolved.length)} 
              sub={`${unresolved.filter(r => r.mainMarket.result === 'avg').length} avg + ${unresolved.filter(r => r.mainMarket.result === 'no-odd').length} no-odd`}
              color={C.gold} />
          )}
          <KpiCard label="Stake Fixo" value={`R$ ${STAKE_FIXA.toFixed(2)}`} sub="Por aposta" color={C.blue} />
          <KpiCard label="Jogos no Período" value={String(filtered.length)} sub={`${confirmed.length} + ${unresolved.length} = ${filtered.length}`} />
        </div>

        {roiChart.length > 1 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 20px" }}>📈 Evolução do Lucro — Últimos {period} dias</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={roiChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" stroke={C.muted} tick={{ fontSize: 11 }} />
                <YAxis stroke={C.muted} tick={{ fontSize: 11 }} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}
                  formatter={((v: unknown, name: unknown) => [`R$ ${Number(v ?? 0).toFixed(2)}`, name === "acumulado" ? "Acumulado" : "Diário"]) as any}
                />
                <Line type="monotone" dataKey="acumulado" stroke={C.green} strokeWidth={2} dot={false} name="acumulado" />
                <Line type="monotone" dataKey="diario" stroke={C.blue} strokeWidth={1} dot={false} name="diario" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {byMarket.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 20px" }}>🎯 Performance por Mercado</h2>
            <ResponsiveContainer width="100%" height={Math.max(180, byMarket.length * 40)}>
              <BarChart data={byMarket} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis type="number" stroke={C.muted} tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
                <YAxis type="category" dataKey="market" stroke={C.muted} tick={{ fontSize: 11 }} width={130} />
                <Tooltip
                  contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}
                  formatter={((v: unknown) => [`${Number(v ?? 0).toFixed(1)}%`, "Hit Rate"]) as any}
                />
                <Bar dataKey="hitRate" radius={[0, 4, 4, 0]}>
                  {byMarket.map((entry, i) => (
                    <Cell key={i} fill={entry.hitRate >= 65 ? C.green : entry.hitRate >= 50 ? C.gold : C.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {byLeague.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 20px" }}>🏆 Performance por Liga</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Classificação", "Liga", "N", "W", "L", "Hit Rate", "ROI", "Lucro"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byLeague.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: "10px 12px" }}>{l.classificacao}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{l.league}</td>
                      <td style={{ padding: "10px 12px", color: C.muted }}>{l.total}</td>
                      <td style={{ padding: "10px 12px", color: C.green }}>{l.wins}</td>
                      <td style={{ padding: "10px 12px", color: C.red }}>{l.total - l.wins}</td>
                      <td style={{ padding: "10px 12px", color: l.hitRate >= 60 ? C.green : l.hitRate >= 45 ? C.gold : C.red, fontWeight: 700 }}>
                        {l.hitRate.toFixed(1)}%
                      </td>
                      <td style={{ padding: "10px 12px", color: l.roi >= 0 ? C.green : C.red }}>
                        {l.roi >= 0 ? "+" : ""}{l.roi.toFixed(1)}%
                      </td>
                      <td style={{ padding: "10px 12px", color: l.profit >= 0 ? C.green : C.red }}>
                        {l.profit >= 0 ? "+" : ""}R$ {l.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirmed.length === 0 && !loading && (
          <EmptyState
            icon="📊"
            title={results.length > 0 ? `Nenhuma aposta confirmada nos últimos ${period} dias` : "Nenhum dado para analisar"}
            subtitle={results.length > 0 ? "Os jogos ainda não têm resultado (win/lose) definido." : "Importe dados pelo Admin para começar."}
            actionLabel="⚙️ Ir para Admin"
            actionHref="/admin"
          />
        )}

      </div>
    </div>
  );
}
