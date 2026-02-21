'use client';

import React from 'react';

export const C = {
  bg: "#0a0f1f",
  card: "#1e293b",
  surface: "#161b22",
  border: "#374151",
  accent: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  gold: "#d29922",
  gray: "#6b7280",
  text: "#f9fafb",
  muted: "#9ca3af",
  blue: "#58a6ff",
  elite: "#f0c040",
  purple: "#bc8cff",
};

export type BetStatus = "win" | "lose" | "push" | "no-odd" | "avg" | "pending_manual";

export function Badge({ result }: { result: BetStatus }) {
  const map: Record<BetStatus, [string, string, string, string]> = {
    win:            ["✅ Verde",      "#052e16", C.green,  "Aposta vencedora"],
    lose:           ["❌ Vermelho",   "#450a0a", C.red,    "Aposta perdida"],
    push:           ["🟡 Push",      "#422006", C.yellow, "Empate técnico — stake devolvida"],
    "no-odd":       ["— Void",       "#1f2937", C.gray,   "Sem odd disponível no CSV"],
    avg:            ["📊 Média",     "#1e1b4b", "#818cf8","Sem dados reais HT — resultado baseado em média histórica"],
    "pending_manual":["⚠️ Pendente", "#451a03", "#f59e0b","Aguardando dados reais para resolver"],
  };
  const [label, bg, color, tooltip] = map[result] ?? map["no-odd"];
  return (
    <span title={tooltip} style={{
      background: bg, color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: "2px 7px", fontSize: 11,
      fontWeight: 600, whiteSpace: "nowrap", cursor: "help",
    }}>
      {label}
    </span>
  );
}

export function KPI({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "14px 18px", flex: "1 1 140px", minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function TH({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: "8px 10px", textAlign: "left", color: C.muted,
      fontWeight: 600, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </th>
  );
}

export function TD({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "8px 10px", verticalAlign: "top", ...style }}>
      {children}
    </td>
  );
}

export function EmptyState({ icon, title, subtitle, actionLabel, actionHref }: {
  icon: string; title: string; subtitle: string;
  actionLabel?: string; actionHref?: string;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, marginBottom: 24 }}>{subtitle}</div>
      {actionLabel && actionHref && (
        <button onClick={() => { window.location.href = actionHref; }} style={{
          background: C.blue, color: '#000', border: 'none', borderRadius: 8,
          padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SectionBox({ children, title, icon, borderColor }: {
  children: React.ReactNode; title: string; icon?: string; borderColor?: string;
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${borderColor ?? C.border}`,
      borderRadius: 12, padding: 24, marginBottom: 24,
    }}>
      {title && (
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px', color: C.text }}>
          {icon && <span style={{ marginRight: 8 }}>{icon}</span>}{title}
        </h2>
      )}
      {children}
    </div>
  );
}

export const mktCat = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("finaliz") || l.includes("chute")) return "Finalizações HT";
  if (l.includes("canto") && (l.includes("ht") || l.includes("1t"))) return "Cantos HT";
  if (l.includes("canto") || l.includes("escanteio")) return "Cantos FT";
  if (l.includes("over 2.5")) return "Over 2.5 FT";
  if (l.includes("over 1.5")) return "Over 1.5 FT";
  if (l.includes("btts") || l.includes("ambas")) return "BTTS";
  if (l.includes("over 0.5") && (l.includes("ht") || l.includes("1t"))) return "Gols HT";
  if (l.includes("vence")) return "Fav Vence";
  return "Outros";
};

export const PROFILE_LABELS: Record<string, { label: string; color: string }> = {
  dominant:              { label: "🔥 Dominância",         color: "#ff1744" },
  chutes_ht_fav:         { label: "🎯 Pressão HT",        color: "#ffd600" },
  high_offense_balanced: { label: "⚡ Alta Ofensividade",   color: "#00e676" },
  clear_favorite:        { label: "⭐ Favorito Claro",      color: "#ffd600" },
  slight_fav_offensive:  { label: "📈 Leve Favorito",      color: "#00e676" },
  corner_dominant:       { label: "🚩 Domínio Cantos",     color: "#00c2ff" },
  balanced_btts:         { label: "💜 Ambas Marcam",       color: "#d500f9" },
  balanced_moderate:     { label: "⚖️ Equilibrado",        color: "#6f8aa6" },
  corner_heavy:          { label: "🚩 Volume Cantos",      color: "#00c2ff" },
  low_goals:             { label: "🔒 Jogo Travado",       color: "#ff9100" },
  generic:               { label: "📊 Padrão",             color: "#6f8aa6" },
};

export function ProfileBadge({ profile }: { profile: string }) {
  const p = PROFILE_LABELS[profile] ?? PROFILE_LABELS.generic;
  return (
    <span style={{
      background: `${p.color}18`, border: `1px solid ${p.color}50`,
      color: p.color, borderRadius: 6, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {p.label}
    </span>
  );
}

export function PoisonBadges({ poison }: { poison?: any }) {
  if (!poison?.isPoison || !poison.triggers?.length) return null;
  const primary = poison.primaryTrigger;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {poison.triggers.map((t: any, i: number) => (
          <span key={i} style={{
            background: `${t.color}20`, border: `1px solid ${t.color}60`,
            color: t.color, borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700,
          }}>
            {t.icon} {t.tag}
          </span>
        ))}
      </div>
      {primary?.reason && (
        <span style={{
          color: primary.color, fontSize: 11, opacity: 0.85,
          paddingLeft: 2,
        }}>
          {primary.icon} {primary.reason}
        </span>
      )}
    </div>
  );
}

export function FavoritoBar({ fav }: { fav?: any }) {
  if (!fav || (!fav.chFavGol && !fav.afFav)) return null;
  return (
    <div style={{
      display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12,
      color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 10,
    }}>
      {fav.nome && (
        <span>
          {fav.lado} <strong style={{ color: C.text }}>{fav.nome}</strong>
        </span>
      )}
      {fav.afFav > 0 && (
        <span>AF <strong style={{ color: C.text }}>{Number(fav.afFav).toFixed(0)}%</strong>
          {fav.afDiff > 0 && <span> (gap {Number(fav.afDiff).toFixed(0)})</span>}
        </span>
      )}
      {fav.chFavGol > 0 && (
        <span>Chutes HT <strong style={{ color: C.text }}>{Number(fav.chFavGol).toFixed(1)}</strong></span>
      )}
      {fav.cantFavHT > 0 && (
        <span>Cantos HT <strong style={{ color: C.text }}>{Number(fav.cantFavHT).toFixed(1)}</strong></span>
      )}
    </div>
  );
}
