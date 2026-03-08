import { useMemo } from "react";
import { useBacktest, STAKE_FIXA } from "./useBacktest";

type Period = 7 | 30 | 90;

export function useDashboardMetrics(period: Period) {
  const { results } = useBacktest();

  // Filtrar por período
  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    return results.filter(r => {
      const d = new Date(r.created_at ?? r.hour ?? "");
      return !isNaN(d.getTime()) && d >= cutoff;
    });
  }, [results, period]);

  // Métricas confirmadas
  const confirmed = useMemo(() =>
    filtered.filter(r => r.mainMarket.result === "win" || r.mainMarket.result === "lose"),
    [filtered]
  );
  
  const unresolved = useMemo(() =>
    filtered.filter(r => r.mainMarket.result === "avg" || r.mainMarket.result === "no-odd"),
    [filtered]
  );

  const wins = useMemo(() =>
    confirmed.filter(r => r.mainMarket.result === "win").length,
    [confirmed]
  );
  
  const losses = useMemo(() =>
    confirmed.filter(r => r.mainMarket.result === "lose").length,
    [confirmed]
  );
  
  const hitRate = useMemo(() =>
    confirmed.length > 0 ? (wins / confirmed.length * 100) : 0,
    [confirmed, wins]
  );
  
  const totalProfit = useMemo(() =>
    confirmed.reduce((acc, r) => acc + Number(r.mainMarket.profit || 0), 0),
    [confirmed]
  );
  
  const roi = useMemo(() =>
    confirmed.length > 0 ? (totalProfit / (confirmed.length * STAKE_FIXA)) * 100 : 0,
    [confirmed, totalProfit]
  );

  // Gráfico ROI acumulado por dia
  const roiChart = useMemo(() => {
    const sorted = [...confirmed].sort((a, b) =>
      new Date(a.created_at ?? a.hour ?? "").getTime() - new Date(b.created_at ?? b.hour ?? "").getTime()
    );
    let cumulative = 0;
    const byDay: Record<string, { profit: number }> = {};
    
    sorted.forEach(r => {
      const key = new Date(r.created_at ?? r.hour ?? "").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!byDay[key]) byDay[key] = { profit: 0 };
      cumulative += Number(r.mainMarket.profit || 0);
      byDay[key] = { profit: cumulative };
    });
    
    return Object.entries(byDay).map(([date, data]) => ({
      date,
      profit: data.profit
    }));
  }, [confirmed]);

  return {
    filtered,
    confirmed,
    unresolved,
    wins,
    losses,
    hitRate,
    totalProfit,
    roi,
    roiChart
  };
}
