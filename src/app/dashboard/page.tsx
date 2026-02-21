"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { NavHeader } from "../../components/NavHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useBacktest, STAKE_FIXA } from "../../hooks/useBacktest";

const C = {
  bg: "#0d1117",
  surface: "#161b22",
  border: "#30363d",
  text: "#e6edf3",
  muted: "#8b949e",
  green: "#3fb950",
  red: "#f85149",
  blue: "#58a6ff",
  gold: "#d29922",
  elite: "#f0c040",
  purple: "#bc8cff",
};

type Period = 7 | 30 | 90;

function KpiCard({ label, value, sub, color = C.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 160 }}>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const catLabel = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("finaliz") || l.includes("chute")) return "Finalizações HT";
  if (l.includes("canto") && (l.includes("ht") || l.includes("1t"))) return "Cantos HT";
  if (l.includes("canto")) return "Cantos FT";
  if (l.includes("over 2.5")) return "Over 2.5 FT";
  if (l.includes("over 1.5")) return "Over 1.5 FT";
  if (l.includes("btts") || l.includes("ambas")) return "BTTS";
  if (l.includes("over 0.5")) return "Gols HT";
  if (l.includes("vence")) return "Fav Vence";
  return "Outros";
};

export default function Dashboard() {
  const router = useRouter();
  const { results, loading } = useBacktest();
  const [period, setPeriod] = useState<Period>(30);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    return results.filter(r => {
      const d = new Date(r.created_at ?? r.hour ?? "");
      return !isNaN(d.getTime()) && d >= cutoff;
    });
  }, [results, period]);

  const confirmed = useMemo(() =>
    filtered.filter(r => r.mainMarket.result === "win" || r.mainMarket.result === "lose"),
    [filtered]
  );

  const wins = confirmed.filter(r => r.mainMarket.result === "win").length;
  const losses = confirmed.filter(r => r.mainMarket.result === "lose").length;
  const hitRate = confirmed.length > 0 ? (wins / confirmed.length * 100) : 0;
  const totalProfit = confirmed.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0);
  const roi = confirmed.length > 0 ? (totalProfit / (confirmed.length * STAKE_FIXA) * 100) : 0;

  const roiChart = useMemo(() => {
    const sorted = [...confirmed].sort((a, b) =>
      new Date(a.created_at ?? a.hour ?? "").getTime() - new Date(b.created_at ?? b.hour ?? "").getTime()
    );
    let cumulative = 0;
    const byDay: Record<string, { profit: number }> = {};
    sorted.forEach(r => {
      const key = new Date(r.created_at ?? r.hour ?? "").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!byDay[key]) byDay[key] = { profit: 0 };
      byDay[key].profit += Number(r.mainMarket.profit || 0);
    });
    return Object.entries(byDay).map(([date, v]) => {
      cumulative += v.profit;
      return { date, diario: Number(v.profit.toFixed(2)), acumulado: Number(cumulative.toFixed(2)) };
    });
  }, [confirmed]);

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
        classificacao: v.total >= 20 && v.wins/v.total >= 0.70 ? "🔥 ELITE" : v.total >= 10 && v.wins/v.total >= 0.60 ? "✅ FORTE" : v.total >= 5 && v.wins/v.total >= 0.50 ? "📊 MODERADO" : v.wins/v.total < 0.40 && v.total >= 5 ? "❌ EVITAR" : "⚠️ NEUTRO",
      }))
      .filter(l => l.total >= 3).sort((a, b) => b.hitRate - a.hitRate);
  }, [confirmed]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif" }}>

      <NavHeader activePage="/dashboard" subtitle={`V1.0.0 · ${results.length} jogos no banco`} />

      <div style={{ padding: "40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📊 Dashboard Analítico</h1>
            <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>{confirmed.length} apostas confirmadas no período</p>
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
          <KpiCard label="Stake Fixo" value={`R$ ${STAKE_FIXA.toFixed(2)}`} sub="Por aposta" color={C.blue} />
          <KpiCard label="Jogos no Período" value={String(filtered.length)} sub={`${confirmed.length} com resultado`} />
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
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {results.length > 0 ? `Nenhuma aposta confirmada nos últimos ${period} dias` : "Nenhum dado para analisar"}
            </div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>
              {results.length > 0 ? "Os jogos ainda não têm resultado (win/lose) definido." : "Importe dados pelo Admin para começar."}
            </div>
            <button onClick={() => router.push("/admin")} style={{
              background: C.blue, color: "#000", border: "none", borderRadius: 8,
              padding: "10px 24px", cursor: "pointer", fontWeight: 700, fontSize: 14,
            }}>⚙️ Ir para Admin</button>
          </div>
        )}

      </div>
    </div>
  );
}
