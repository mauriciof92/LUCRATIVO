'use client';

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NavHeader } from "../../components/NavHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useBacktest, STAKE_FIXA } from "../../hooks/useBacktest";
import { C, KPI as KpiCard, EmptyState, mktCat as catLabel } from "../../components/ui";
import { PreLiveMultipleAnalyzer, analyzeLiveMultiplesAsync } from "../../lib/pre-live-multiple-analyzer";

type Period = 7 | 30 | 90;

// ── FUNÇÃO DE JUSTIFICATIVA DA SINfONIA ─────────────────────────────
function poissonProb(lambda: number, k: number): number {
  // P(X > k) — mesma do engine
  const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1)
  let cdf = 0
  for (let i = 0; i <= Math.floor(k); i++) {
    cdf += Math.pow(lambda, i) * Math.exp(-lambda) / factorial(i)
  }
  return 1 - cdf
}

interface SinfoniaLine {
  label: string
  odd: number
  riskProfile: 'safe' | 'medium' | 'risky'
  source: string
  prob: number | null
  ev: number | null
  justification: string
  blocked: boolean
}

function buildLineJustification(
  label: string,
  odd: number,
  game: any
): SinfoniaLine {
  const l = (label ?? '').toLowerCase()
  // Bug 2: Ler gameStats da selection em vez de game.favorito
  const stats = game.gameStats ?? {}
  const fav = game.favorito ?? {}
  const gameConf = game.confidence
    ? Number(game.confidence) > 1
      ? Number(game.confidence) / 100
      : Number(game.confidence)
    : Number(game.score ?? 0)

  // FINALIZAÇÕES HT
  if (l.includes('finaliz') && l.includes('ht')) {
    const shots = Number(stats.chFavGol ?? fav.chFavGol ?? 0)
    const line = parseFloat(label.match(/over ([\d.]+)/i)?.[1] ?? '0')
    const prob = shots > 0 ? poissonProb(shots, line) : null
    const ev = prob !== null && odd > 0 ? (prob * odd) - 1 : null
    return {
      label, odd, riskProfile: 'safe',
      source: `chFavGol ${shots.toFixed(1)}/HT`,
      prob, ev,
      justification: prob !== null
        ? `Média ${shots.toFixed(1)} fin. HT — Poisson ${(prob*100).toFixed(0)}% de superar ${line}` 
        : `Média ${shots.toFixed(1)} finalizações HT por jogo`,
      blocked: prob === null || prob < 0.68,
    }
  }

  // CANTOS HT FAVORITO
  if (l.includes('canto') && (l.includes('ht') || l.includes('1t') || l.includes('1º'))) {
    const corners = Number(stats.cantFavHT ?? fav.cantFavHT ?? 0)
    const line = parseFloat(label.match(/over ([\d.]+)/i)?.[1] ?? '0')
    const prob = corners > 0 ? poissonProb(corners, line) : null
    const ev = prob !== null && odd > 0 ? (prob * odd) - 1 : null
    return {
      label, odd, riskProfile: 'safe',
      source: `cantFavHT ${corners.toFixed(1)}/HT`,
      prob, ev,
      justification: prob !== null
        ? `Média ${corners.toFixed(1)} cantos HT — Poisson ${(prob*100).toFixed(0)}% de superar ${line}` 
        : `Média ${corners.toFixed(1)} cantos HT por jogo`,
      blocked: prob === null || prob < 0.68,
    }
  }

  // CANTOS FT
  if (l.includes('canto') && l.includes('ft')) {
    const lambda = Number(stats.cantFTH ?? 0) + Number(stats.cantFTA ?? 0)
    const fallbackLambda = Number(stats.cantFavHT ?? fav.cantFavHT ?? 0) * 1.6  // fallback se FT zerado
    const effectiveLambda = lambda > 0 ? lambda : fallbackLambda
    const line = parseFloat(label.match(/over ([\d.]+)/i)?.[1] ?? '0')
    const prob = effectiveLambda > 0 ? poissonProb(effectiveLambda, line) : null
    const ev = prob !== null && odd > 0 ? (prob * odd) - 1 : null
    const sourceLabel = lambda > 0 ? `cantFT real ${effectiveLambda.toFixed(1)}/jogo` : `cantFT est. ${effectiveLambda.toFixed(1)}/jogo` 
    return {
      label, odd, riskProfile: 'medium',
      source: sourceLabel,
      prob, ev,
      justification: prob !== null
        ? `Média FT ${effectiveLambda.toFixed(1)} cantos totais — Poisson ${(prob*100).toFixed(0)}% de superar ${line}` 
        : `Estimativa FT baseada em HT`,
      blocked: prob === null || prob < 0.62,
    }
  }

  // OVER 0.5 GOLS HT
  if ((l.includes('over 0.5') || l.includes('0,5')) && (l.includes('ht') || l.includes('gol'))) {
    // 🆕 Corrigir bug: gol05HTFav pode vir como 88 (inteiro) em vez de 0.88 (decimal)
    const rawHitRate = Number(stats.gol05HTFav ?? fav.gol05HTFav ?? gameConf)
    const hitRate = rawHitRate > 1 ? rawHitRate / 100 : rawHitRate
    const ev = odd > 0 ? (hitRate * odd) - 1 : null
    return {
      label, odd, riskProfile: 'safe',
      source: `${(hitRate*100).toFixed(0)}% histórico`,
      prob: hitRate, ev,
      justification: `Marcou no 1T em ${(hitRate*100).toFixed(0)}% dos jogos na temporada`,
      blocked: hitRate < 0.75,
    }
  }

  // OVER 1.5 FT
  if (l.includes('over 1.5') && !l.includes('canto') && !l.includes('ht')) {
    const xg = Number(stats.xgH ?? 0) + Number(stats.xgA ?? 0)
    const prob = xg > 0 ? poissonProb(xg, 1.5) : null
    const ev = prob !== null && odd > 0 ? (prob * odd) - 1 : null
    return {
      label, odd, riskProfile: 'medium',
      source: `xG ${xg.toFixed(2)}`,
      prob, ev,
      justification: prob !== null
        ? `xG combinado ${xg.toFixed(2)} — Poisson ${(prob*100).toFixed(0)}% de superar 1.5 gols` 
        : `xG estimado pelo engine`,
      blocked: prob === null || prob < 0.60,
    }
  }

  // OVER 2.5 FT
  if (l.includes('over 2.5') && !l.includes('canto')) {
    const xg = Number(stats.xgH ?? 0) + Number(stats.xgA ?? 0)
    const prob = xg > 0 ? poissonProb(xg, 2.5) : null
    const ev = prob !== null && odd > 0 ? (prob * odd) - 1 : null
    return {
      label, odd, riskProfile: 'medium',
      source: `xG ${xg.toFixed(2)}`,
      prob, ev,
      justification: prob !== null
        ? `xG combinado ${xg.toFixed(2)} — Poisson ${(prob*100).toFixed(0)}% de superar 2.5 gols` 
        : `xG estimado pelo engine`,
      blocked: prob === null || prob < 0.55,
    }
  }

  // FALLBACK
  return {
    label, odd, riskProfile: 'medium',
    source: 'Engine',
    prob: gameConf,
    ev: odd > 0 ? (gameConf * odd) - 1 : null,
    justification: `Selecionado pelo engine — confiança ${(gameConf*100).toFixed(0)}%`,
    blocked: gameConf < 0.65,
  }
}

// ── COMPONENTE DO CARD DA SINfONIA ─────────────────────────────────
function SinfoniaCard({ suggestion }: { suggestion: any }) {
  const selections = suggestion.selections ?? []
  const firstSelection = selections[0] ?? {}
  
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #238636',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 20,
      boxShadow: '0 0 20px #23863620',
    }}>

      {/* HEADER DO BILHETE */}
      <div style={{
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3' }}>
            🐦 Sinfonia
          </span>
          <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 10 }}>
            {selections.length} mercados · Stake R$ {suggestion.suggestedStake?.toFixed(2) ?? '20.00'}
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f0c040' }}>
          Retorno R$ {((suggestion.suggestedStake ?? 20) * (suggestion.combinedOdd ?? 1)).toFixed(2)}
        </div>
      </div>

      {/* JOGO ATIVO */}
      <div style={{ padding: '0 0 16px 0' }}>

        {/* Header do jogo */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px 10px',
          borderBottom: '1px solid #21262d',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>
              {firstSelection.match}
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
              🕐 {firstSelection.hour} · {firstSelection.league}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#8b949e' }}>Odd do jogo</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f0c040' }}>
              {suggestion.combinedOdd?.toFixed(2) ?? '—'}
            </div>
          </div>
        </div>

        {/* LISTA DE PERNAS — estética original + justificativa */}
        <div style={{ padding: '8px 20px 0' }}>
          {selections.map((sel: any, i: number) => {
            const justified = buildLineJustification(sel.market || '', Number(sel.odd ?? 0), sel)
            const evColor = justified.ev === null ? '#555'
              : justified.ev >= 0.20 ? '#3fb950'
              : justified.ev >= 0.08 ? '#58a6ff'
              : justified.ev >= 0.00 ? '#f0c040'
              : '#f85149'
            const evLabel = justified.ev === null ? 'Sem dado'
              : justified.ev >= 0.20 ? `🔥 EV +${(justified.ev*100).toFixed(0)}%` 
              : justified.ev >= 0.08 ? `✅ EV +${(justified.ev*100).toFixed(0)}%` 
              : justified.ev >= 0.00 ? `⚠️ EV +${(justified.ev*100).toFixed(0)}%` 
              : `⚠️ EV ${(justified.ev*100).toFixed(0)}%` 

            return (
              <div key={i} style={{
                borderBottom: i < selections.length - 1 ? '1px solid #21262d' : 'none',
                padding: '10px 0',
              }}>
                {/* Linha principal — igual ao original */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Círculo de seleção original */}
                    <div style={{
                      width: 16, height: 16,
                      borderRadius: '50%',
                      border: '2px solid #30363d',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 14, color: '#e6edf3' }}>
                      {sel.market}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 14, fontWeight: 600, color: '#e6edf3',
                    marginLeft: 16,
                  }}>
                    {sel.odd > 0 ? Number(sel.odd).toFixed(2) : '—'}
                  </span>
                </div>

                {/* Justificativa — linha compacta abaixo */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 5,
                  marginLeft: 26,
                  flexWrap: 'wrap',
                }}>
                  {/* Badge risco */}
                  <span style={{
                    fontSize: 10,
                    color: justified.riskProfile === 'safe' ? '#3fb950'
                         : justified.riskProfile === 'medium' ? '#f0c040' : '#f85149',
                    background: justified.riskProfile === 'safe' ? '#3fb95015'
                              : justified.riskProfile === 'medium' ? '#f0c04015' : '#f8514915',
                    padding: '1px 6px',
                    borderRadius: 4,
                    fontWeight: 600,
                  }}>
                    {justified.riskProfile === 'safe' ? '🛡 Seguro'
                     : justified.riskProfile === 'medium' ? '⚡ Médio' : '⚠️ Risco'}
                  </span>

                  {/* Badge EV */}
                  <span style={{
                    fontSize: 10,
                    color: evColor,
                    background: evColor + '15',
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}>
                    {evLabel}
                  </span>

                  {/* Justificativa textual */}
                  <span style={{
                    fontSize: 10,
                    color: '#555',
                    fontStyle: 'italic',
                  }}>
                    {justified.justification}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* RODAPÉ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        borderTop: '1px solid #21262d',
        background: '#161b22',
      }}>
        <span style={{ fontSize: 12, color: '#3fb950', fontWeight: 600 }}>
          Risco: {suggestion.riskLevel === 'low' ? 'Baixo' : suggestion.riskLevel === 'medium' ? 'Médio' : 'Alto'}
        </span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#8b949e' }}>Odd combinada total  </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f0c040' }}>
            {suggestion.combinedOdd?.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── HELPER DE AGRUPAMENTO POR JOGO ───────────────────────────────
function groupByGame(selections: any[] = []) {
  return selections.reduce((acc, sel) => {
    const key = sel.match
    if (!acc[key]) acc[key] = {
      match: sel.match,
      league: sel.league,
      hour: sel.hour,
      profile: sel.gameProfile,
      confidence: sel.confidence,
      lines: [],
      gameOdd: 1,
    }
    acc[key].lines.push(sel)
    acc[key].gameOdd = acc[key].lines
      .filter((l: any) => l.odd > 1)
      .reduce((o: number, l: any) => o * Number(l.odd), 1)
    return acc
  }, {} as Record<string, any>)
}

// ── HELPER DE SINERGIA ENTRE PERFIS ───────────────────────────────
function getSynergyLabel(profiles: string[]): string {
  if (profiles.length < 2) return ''
  const unique = Array.from(new Set(profiles))
  if (unique.every(p => p.includes('corner') || p.includes('chute'))) return 'Perfis ofensivos'
  if (unique.every(p => p.includes('balanced') || p.includes('btts'))) return 'Perfis equilibrados'
  if (unique.some(p => p === 'dominant') && unique.some(p => p.includes('corner'))) return 'Dominância + cantos'
  if (unique.some(p => p === 'dominant')) return 'Jogo dominante'
  return 'Perfis compatíveis'
}

// ── COMPONENTE DO CARD DA MÚLTIPLA ───────────────────────────────
function MultipleCard({ s }: { s: any }) {
  const style = TICKET_STYLES[s.type] ?? TICKET_STYLES.bingoSeguro
  const groups = Object.values(groupByGame(s.selections))
  const combinedOdd = s.combinedOdd ?? 0
  const nLegs = s.selections?.length ?? 0
  const nGames = groups.length

  // Badge de sinergia entre perfis
  const profiles = Array.from(new Set(groups.map((g: any) => g.profile ?? '')))
  const synergyLabel = getSynergyLabel(profiles)

  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${style.color}35`,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Barra de cor no topo */}
      <div style={{ height: 3, background: style.color }} />

      {/* HEADER DO BILHETE */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: style.color, marginBottom: 3 }}>
            {style.icon} {style.label}
          </div>
          <div style={{ fontSize: 12, color: '#8b949e' }}>
            {nGames} jogo{nGames > 1 ? 's' : ''} · {nLegs} mercado{nLegs > 1 ? 's' : ''} · Stake R$ {s.suggestedStake?.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: style.color }}>
            {combinedOdd > 0 ? combinedOdd.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            Retorno R$ {s.expectedReturn?.toFixed(2) ?? '—'}
          </div>
        </div>
      </div>

      {/* GRUPOS POR JOGO */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g: any, gi: number) => (
          <div key={gi} style={{
            background: '#0d1117',
            border: '1px solid #21262d',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Header do jogo */}
            <div style={{
              padding: '8px 14px',
              background: '#161b22',
              borderBottom: '1px solid #21262d',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>
                  {g.match}
                </div>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 1 }}>
                  🕐 {g.hour} · {g.league}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Badge de score */}
                <span style={{
                  fontSize: 10,
                  color: (g.confidence ?? 0) >= 75 ? '#f0c040'
                       : (g.confidence ?? 0) >= 60 ? '#3fb950' : '#58a6ff',
                  background: '#21262d',
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontWeight: 600,
                }}>
                  {g.confidence ?? 0}%
                </span>
                {/* Badge de perfil */}
                {g.profile && (
                  <span style={{
                    fontSize: 10,
                    color: '#8b949e',
                    background: '#21262d',
                    padding: '2px 7px',
                    borderRadius: 4,
                  }}>
                    {g.profile}
                  </span>
                )}
                {/* Odd do jogo */}
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#e6edf3',
                  minWidth: 36,
                  textAlign: 'right',
                }}>
                  {g.gameOdd > 1 ? g.gameOdd.toFixed(2) : '—'}
                </span>
              </div>
            </div>

            {/* Linhas do jogo */}
            <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.lines.map((sel: any, si: number) => (
                <div key={si} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: style.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, color: '#c9d1d9' }}>
                      {sel.market}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: sel.odd > 1 ? '#e6edf3' : '#555',
                  }}>
                    {sel.odd > 1 ? Number(sel.odd).toFixed(2) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* RODAPÉ — sinergia + risco */}
      <div style={{
        padding: '10px 20px',
        borderTop: '1px solid #21262d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#0d1117',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#555' }}>Risco:</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: s.riskLevel === 'low' ? '#3fb950'
                 : s.riskLevel === 'high' ? '#f85149' : '#f0c040',
          }}>
            {s.riskLevel === 'low' ? 'Baixo' : s.riskLevel === 'high' ? 'Alto' : 'Médio'}
          </span>
          {/* Badge de sinergia — só se houver mais de 1 jogo */}
          {nGames > 1 && synergyLabel && (
            <span style={{
              fontSize: 10,
              color: '#8b949e',
              background: '#21262d',
              padding: '2px 8px',
              borderRadius: 4,
              marginLeft: 4,
            }}>
              � {synergyLabel}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#8b949e' }}>
          {s.riskReward ?? ''}
        </span>
      </div>
    </div>
  )
}

// ── COMPONENTE FT BOX BUILDER REFORMADO ─────────────────────────────
function FTBoxBuilder({ ftBoxCandidates, ftBoxSelections, setFtBoxSelections, liveOdd, activeCount, onGenerate }: any) {
  const toggleGame = (i: number) => {
    setFtBoxSelections((prev: any[]) => prev.map((s: any) =>
      s.gameIdx === i ? { ...s, enabled: !s.enabled } : s
    ))
  }

  const switchMarket = (gameIdx: number, marketIdx: number) => {
    setFtBoxSelections((prev: any[]) => prev.map((s: any) =>
      s.gameIdx === gameIdx ? { ...s, marketIdx } : s
    ))
  }

  return (
    <div style={{ background: '#161b22', border: '1px solid #ff980040',
      borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>

      {/* HEADER */}
      <div style={{ height: 3, background: '#ff9800' }} />
      <div style={{ padding: '14px 20px 12px',
        borderBottom: '1px solid #21262d',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ff9800' }}>
            🔥 Box FT Personalizado
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
            Selecione 2-3 jogos com mercados FT dominantes
          </div>
        </div>

        {/* ODD AO VIVO */}
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 22, fontWeight: 700,
            color: activeCount >= 2 ? '#ff9800' : '#444',
          }}>
            {activeCount >= 2 ? liveOdd.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            {activeCount} jogo{activeCount !== 1 ? 's' : ''} · R$ {(liveOdd * 25).toFixed(2)}
          </div>
        </div>
      </div>

      {/* AVISO > 3 JOGOS */}
      {activeCount > 3 && (
        <div style={{
          margin: '8px 16px 0',
          padding: '6px 12px',
          background: '#3a2200',
          border: '1px solid #ff980060',
          borderRadius: 6,
          fontSize: 11,
          color: '#ff9800',
        }}>
          ⚠️ Mais de 3 jogos aumenta o risco. Recomendado: 2-3.
        </div>
      )}

      {/* LISTA DE JOGOS */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ftBoxCandidates?.slice(0, 4).map((candidate: any, gi: number) => {
          const sel = ftBoxSelections.find((s: any) => s.gameIdx === gi)
          if (!sel) return null
          const activeMarket = candidate.markets?.[sel.marketIdx]

          return (
            <div key={gi} style={{
              background: sel.enabled ? '#0d1117' : '#0a0a0a',
              border: `1px solid ${sel.enabled ? '#21262d' : '#1a1a1a'}`,
              borderRadius: 8,
              opacity: sel.enabled ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}>

              {/* Header do jogo — clicável para toggle */}
              <div
                onClick={() => toggleGame(gi)}
                style={{
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  borderBottom: sel.enabled ? '1px solid #21262d' : 'none',
                }}>

                {/* Checkbox visual */}
                <div style={{
                  width: 16, height: 16,
                  borderRadius: 4,
                  border: `2px solid ${sel.enabled ? '#ff9800' : '#444'}`,
                  background: sel.enabled ? '#ff9800' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {sel.enabled && (
                    <span style={{ fontSize: 10, color: '#000', fontWeight: 700 }}>✓</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {candidate.game?.match ?? `${candidate.game?.home} x ${candidate.game?.away}`}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 1 }}>
                    {candidate.game?.league} · {candidate.game?.hour}
                    {candidate.goldCount > 0 && (
                      <span style={{ color: '#f0c040', marginLeft: 6 }}>
                        ⭐ {candidate.goldCount} gold
                      </span>
                    )}
                  </div>
                </div>

                {/* Score badge */}
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: (candidate.score ?? 0) > 0.75 ? '#f0c040' : '#3fb950',
                  background: '#21262d',
                  padding: '2px 7px', borderRadius: 4,
                }}>
                  {Math.round((candidate.score ?? 0) * 100)}%
                </span>
              </div>

              {/* Mercados — só quando jogo ativo */}
              {sel.enabled && (
                <div style={{ padding: '8px 14px',
                  display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {candidate.markets?.map((market: any, mi: number) => {
                    const isSelected = sel.marketIdx === mi
                    return (
                      <div
                        key={mi}
                        onClick={() => switchMarket(gi, mi)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isSelected ? '#ff980015' : 'transparent',
                          border: `1px solid ${isSelected ? '#ff980050' : 'transparent'}`,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Radio visual */}
                          <div style={{
                            width: 12, height: 12, borderRadius: '50%',
                            border: `2px solid ${isSelected ? '#ff9800' : '#444'}`,
                            background: isSelected ? '#ff9800' : 'transparent',
                            flexShrink: 0,
                          }} />
                          <span style={{
                            fontSize: 12,
                            color: isSelected ? '#e6edf3' : '#8b949e',
                          }}>
                            {market.label}
                          </span>
                          {/* Gold badge */}
                          {market.gold && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: '#000',
                              background: '#f0c040',
                              padding: '1px 5px', borderRadius: 3,
                            }}>
                              GOLD
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {/* Probabilidade Poisson */}
                          <span style={{ fontSize: 10, color: '#8b949e' }}>
                            {Math.round((market.prob ?? 0) * 100)}%
                          </span>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: isSelected ? '#ff9800' : '#555',
                          }}>
                            {market.odd?.toFixed(2) ?? '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* RODAPÉ */}
      <div style={{
        padding: '10px 20px',
        borderTop: '1px solid #21262d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#0d1117',
      }}>
        <button
          onClick={() => {
            const activeSelections = ftBoxSelections.filter((s: any) => s.enabled)
              .map((s: any) => ({
                game: ftBoxCandidates[s.gameIdx].game,
                marketType: ftBoxCandidates[s.gameIdx].markets[s.marketIdx].axis,
              }))
            onGenerate(activeSelections)
          }}
          disabled={activeCount < 2}
          style={{
            background: activeCount >= 2 ? '#ff9800' : '#21262d',
            color: activeCount >= 2 ? '#000' : '#555',
            border: 'none',
            borderRadius: 8,
            padding: '8px 24px',
            fontSize: 13,
            fontWeight: 700,
            cursor: activeCount >= 2 ? 'pointer' : 'not-allowed',
          }}>
          Gerar Box FT
        </button>

        <span style={{ fontSize: 11, color: '#8b949e' }}>
          Stake R$ 25,00 · Retorno R$ {(liveOdd * 25).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

const TICKET_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  // 🆕 Novos bilhetes Bingo (substituem clássicos)
  bingoSeguro:  { label: 'Bingo Seguro',  color: '#58a6ff', icon: '🎯' },
  bingoAlavanc: { label: 'Bingo Alavanc', color: '#ff1744', icon: '�' },
  // Manter: Sinfonia e FT Box
  sinfonia:    { label: 'Sinfonia',     color: '#00e676', icon: '🐦' },
  ftbox:       { label: 'Box FT',      color: '#ff9800', icon: '🔥' },
  // Removidos: bronze, silver, gold, agressivo, bingo
};

export default function MultipleAnalyzerPage() {
  const { results, todayGames, lastCsvText } = useBacktest();
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [odds, setOdds] = useState<Record<number, any>>({});
  const [unmatchedGames, setUnmatchedGames] = useState<any[]>([]);
  const [showUnmatchedDetails, setShowUnmatchedDetails] = useState(false);
  const [ignoredMatches, setIgnoredMatches] = useState<string[]>([]);
  const [sinfoniaIdx, setSinfoniaIdx] = useState(0);  // 🆕 Estado de navegação da Sinfonia

  // 🆕 Estados para FT Box Personalizado
  const [showFTBoxBuilder, setShowFTBoxBuilder] = useState(false);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());
  
  // 🆕 Nova estrutura para FT Box Builder reformado
  const [ftBoxSelections, setFtBoxSelections] = useState<any[]>([]);
  const [ftBoxCandidates, setFtBoxCandidates] = useState<any[]>([]);

  // 🆕 Inicializar FT Box Builder automaticamente quando candidates chega
  useEffect(() => {
    if (!ftBoxCandidates?.length) return
    const initial = ftBoxCandidates
      .slice(0, 4) // mostrar no máximo 4 candidatos
      .map((c: any, i: number) => ({
        gameIdx: i,
        marketIdx: 0, // pré-seleciona mercado[0] = melhor (gold primeiro)
        enabled: i < 3, // pré-ativa os 3 primeiros
      }))
    setFtBoxSelections(initial)
  }, [ftBoxCandidates])

  // 🆕 Odd acumulada em tempo real
  const liveOdd = useMemo(() => {
    return ftBoxSelections
      .filter(s => s.enabled)
      .reduce((acc, s) => {
        const candidate = ftBoxCandidates?.[s.gameIdx]
        const market = candidate?.markets?.[s.marketIdx]
        return acc * (market?.odd ?? 1)
      }, 1)
  }, [ftBoxSelections, ftBoxCandidates])

  const activeCount = ftBoxSelections.filter(s => s.enabled).length

  // 🆕 Resetar índice da Sinfonia quando os cards mudam
  const sinfoniaCards = suggestions.filter(s => s.type === 'sinfonia');
  useEffect(() => { setSinfoniaIdx(0) }, [sinfoniaCards.length]);

  // 🆕 FORÇAR EXECUÇÃO DO TESTE DE ODDS (DESATIVADO)
  useEffect(() => {
    // Temporariamente desativado para não poluir console
    // async function testOdds() {
    //   // Temporário — só para ver se a API tem os mercados
    //   const KEY = '70c968a10d5fb42058742e546b268f3d'; // hardcode temporário
      
    //   const res = await fetch(
    //     `https://v3.football.api-sports.io/odds?fixture=1378126&bookmaker=8`,
    //     { headers: { 'x-apisports-key': KEY } }
    //   );
    //   const data = await res.json();
    //   const bets = data.response?.[0]?.bookmakers?.[0]?.bets || [];
    //   console.log(`[ODDS-TEST] Total mercados: ${bets.length}`);
    //   bets.forEach((bet: any) => {
    //     console.log(`  [bet.id=${bet.id}] ${bet.name}`);
    //     bet.values?.slice(0, 3).forEach((v: any) => {
    //       console.log(`    → ${v.value}: ${v.odd}`);
    //     });
    //   });
    // };
    // testOdds();
  }, []); // roda UMA vez ao montar
  
  const [customFTBox, setCustomFTBox] = useState<any>(null);

  const analyzer = useMemo(() => new PreLiveMultipleAnalyzer(), []);

  // Usar dados do hook
  const games = todayGames.length > 0 ? todayGames : results;
  // Usar CSV original preservado pelo hook (fallback: localStorage)
  const csvText = useMemo(() => {
    if (lastCsvText) return lastCsvText;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lucrativo-last-csv') ?? '';
    }
    return '';
  }, [lastCsvText]);

  const handleAnalyze = async () => {
    const text = csvText.trim();
    if (!text.trim()) {
      setError('Por favor, cole o CSV do dia');
      return; 
    }
    setAnalyzing(true);
    setError('');
    try {
      // 🆕 1. Buscar odds antes de chamar o analyzer
      const today = new Date().toISOString().split('T')[0];
      let oddsMap: Record<number, any> = {};
      let fixtureMap: Record<string, number> = {};

      try {
        const oddsRes = await fetch('/api/football-odds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText: text, date: today }),
        });
        if (oddsRes.ok) {
          const oddsData = await oddsRes.json();
          oddsMap = oddsData.oddsMap ?? {};
          fixtureMap = oddsData.fixtureMap ?? {};
          console.log('[MULTIPLE-ANALYZER] oddsMap injetado:', Object.keys(oddsMap).length, 'fixtures');
        }
      } catch (e) {
        console.warn('[MULTIPLE-ANALYZER] Falha ao buscar odds, usando fallback:', e);
        // Continua sem odds reais — não bloqueia a análise
      }

      // 🆕 2. Substituir chamada com oddsMap/fixtureMap
      const result = await analyzeLiveMultiplesAsync(text, oddsMap, fixtureMap, ignoredMatches);
      
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
      // 🆕 Guardar ftBoxCandidates para o construtor manual
      setFtBoxCandidates(result.ftBoxCandidates ?? []);
      if ((result.suggestions ?? []).length === 0) {
        setError(`Nenhuma múltipla gerada. ${result.summary.totalGames} jogos no banco, ${result.summary.qualityGames} com qualidade suficiente (score≥65%, conf≥55%). Cada perna precisa de odd entre 1.20–2.50.`);
      }
    } catch (e: any) {
      setError('Erro ao analisar: ' + (e?.message ?? String(e)));
    } finally {
      setAnalyzing(false);
    }
  };

  // 🆕 Gerar Box FT Personalizado (reformado)
  const handleGenerateCustomFTBox = async (activeSelections: any[] = []) => {
    // Se chamado pelo novo FTBoxBuilder, usa activeSelections
    // Se chamado pelo legado, usa selectedGames/selectedMarkets
    let selectedGamesData: any[] = [];
    let selectedMarketsData: any[] = [];

    if (activeSelections.length > 0) {
      // Novo formato do FTBoxBuilder reformado
      selectedGamesData = activeSelections.map(s => s.game);
      selectedMarketsData = activeSelections.map((s, index) => ({
        game: s.game,
        marketType: s.marketType,
        key: `${s.game.match || `${s.game.home} x ${s.game.away}`}|${s.marketType}`,
        index
      }));
    } else {
      // Formato legado
      if (selectedGames.size < 2) {
        setError('Selecione pelo menos 2 jogos para o Box FT.');
        return;
      }

      selectedGamesData = games.filter((g: any) => 
        selectedGames.has(g.match || `${g.home} x ${g.away}`)
      );

      selectedMarketsData = Array.from(selectedMarkets).map((marketKey, index) => {
        const [gameMatch, marketType] = marketKey.split('|');
        const game = selectedGamesData.find((g: any) => 
          (g.match || `${g.home} x ${g.away}`) === gameMatch
        );
        return { game, marketType, key: marketKey, index };
      }).filter(m => m.game);
    }

    try {
      const customBox = await analyzer.buildCustomFTBox(selectedGamesData, selectedMarketsData);
      if (customBox) {
        setCustomFTBox(customBox);
        setError('');
      } else {
        setError('Não foi possível gerar o Box FT com as seleções atuais.');
      }
    } catch (e: any) {
      setError('Erro ao gerar Box FT: ' + (e?.message ?? String(e)));
    }
  };

  // 🆕 Obter mercados FT disponíveis para um jogo (com odds reais)
  const getFTMarketsForGame = async (game: any) => {
    const fav = (analyzer as any).getFavorito?.(game);
    if (!fav) return [];

    const markets = [];

    // 🆕 BUSCAR ODDS REAIS DA API
    let realOdds: { cornersLines: any[], shotsLines: any[] } = { cornersLines: [], shotsLines: [] };
    if (game.apiFixtureId) {
      realOdds = await (analyzer as any).fetchRealOdds(game.apiFixtureId);
    }

    // CHUTES FT — linha dinâmica
    if (fav.chFavGol >= 4.0) {
      const lambda = fav.chFavGol * 1.8;
      const linhasChutes = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5];
      
      // Encontrar linha mais alta com prob entre 70-82%
      let bestThreshold = null;
      for (const linha of [...linhasChutes].reverse()) {
        const prob = poissonProb(lambda, linha);
        if (prob >= 0.70 && prob <= 0.82) {
          bestThreshold = { linha, prob };
          break;
        }
      }
      
      if (bestThreshold) {
        let odd = 1.70; // fallback
        let oddsSource = 'fallback';
        
        // 🆕 Tentar usar odds reais
        if (realOdds.shotsLines.length > 0) {
          const closestLine = realOdds.shotsLines.reduce((closest: any, current: any) => {
            const currentDiff = Math.abs(current.line - bestThreshold.linha);
            const closestDiff = Math.abs(closest.line - bestThreshold.linha);
            return currentDiff < closestDiff ? current : closest;
          });
          
          if (Math.abs(closestLine.line - bestThreshold.linha) <= 1.5) {
            odd = closestLine.odd;
            oddsSource = 'api-real';
          }
        }
        
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|chutes_ft`,
          label: `${fav.nome} — Over ${bestThreshold.linha} Chutes FT`,
          axis: 'chutes_ft',
          odd: odd,
          source: oddsSource,
        });
      } else {
        // Fallback se nenhuma linha atingir 70-82%
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|chutes_ft`,
          label: `${fav.nome} — Over 9.5 Chutes FT`,
          axis: 'chutes_ft',
          odd: 1.70,
          source: 'fallback',
        });
      }
    }

    // CANTOS FT — linha dinâmica
    if (fav.cantFavHT >= 3.0) {
      const lambda = fav.cantFavHT * 1.6;
      const linhasCantos = [3.5, 4.5, 5.5, 6.5];
      
      let bestThreshold = null;
      for (const linha of [...linhasCantos].reverse()) {
        const prob = poissonProb(lambda, linha);
        if (prob >= 0.70 && prob <= 0.82) {
          bestThreshold = { linha, prob };
          break;
        }
      }
      
      if (bestThreshold) {
        let odd = 1.85; // fallback
        let oddsSource = 'fallback';
        
        // 🆕 Tentar usar odds reais
        if (realOdds.cornersLines.length > 0) {
          const closestLine = realOdds.cornersLines.reduce((closest: any, current: any) => {
            const currentDiff = Math.abs(current.line - bestThreshold.linha);
            const closestDiff = Math.abs(closest.line - bestThreshold.linha);
            return currentDiff < closestDiff ? current : closest;
          });
          
          if (Math.abs(closestLine.line - bestThreshold.linha) <= 1.0) {
            odd = closestLine.odd;
            oddsSource = 'api-real';
          }
        }
        
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|cantos_ft`,
          label: `${fav.nome} — Over ${bestThreshold.linha} Cantos FT`,
          axis: 'cantos_ft',
          odd: odd,
          source: oddsSource,
        });
      } else {
        // Fallback se nenhuma linha atingir 70-82%
        markets.push({
          key: `${game.match || `${game.home} x ${game.away}`}|cantos_ft`,
          label: `${fav.nome} — Over 3.5 Cantos FT`,
          axis: 'cantos_ft',
          odd: 1.85,
          source: 'fallback',
        });
      }
    }

    return markets;
  };

  const handleFetchOdds = async () => {
    if (suggestions.length === 0) return;
    setLoadingOdds(true);
    setError('');
    try {
      // API key é lida server-side pelo route handler (process.env.FOOTBALL_API_KEY)
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/football-odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, date: today }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const result = await res.json();

      setOdds(result.oddsMap ?? {});
      setUnmatchedGames(result.unmatched ?? []);

      // Re-analisar com odds injetadas
      if (result.oddsMap && result.fixtureMap) {
        analyzer.injectRealOdds(result.oddsMap, result.fixtureMap);
        const enriched = await analyzeLiveMultiplesAsync(csvText, result.oddsMap, result.fixtureMap, ignoredMatches);
        setSuggestions(enriched.suggestions);
      }

      if ((result.unmatched ?? []).length > 0) {
        setShowUnmatchedDetails(true);
      }
    } catch (e: any) {
      setError('Erro ao buscar odds: ' + (e?.message ?? String(e)));
    } finally {
      setLoadingOdds(false);
    }
  };

  // Handler: Ignorar jogo e regerar bilhetes (efeito roleta — só na sessão)
  const regenerateTickets = async (updated: string[]) => {
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = await analyzeLiveMultiplesAsync(text, undefined, undefined, updated);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
    } catch (e) {
      console.error('Erro ao regerar bilhetes:', e);
    }
  };

  const handleIgnoreMatch = (matchName: string) => {
    const updated = [...ignoredMatches, matchName];
    setIgnoredMatches(updated);
    regenerateTickets(updated);
  };

  const handleIgnoreMatchClick = (matchName: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    handleIgnoreMatch(matchName);
  };

  // 🔄 Handler: Limpar todos os jogos ignorados e regerar
  const handleClearIgnored = async () => {
    setIgnoredMatches([]);
    const text = csvText.trim();
    if (!text) return;
    try {
      const result = await analyzeLiveMultiplesAsync(text);
      setSuggestions(result.suggestions ?? []);
      setSummary(result.summary);
    } catch (e) {
      console.error('Erro ao regerar bilhetes:', e);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui,sans-serif' }}>
      <NavHeader activePage="/multiple-analyzer" />

      <div style={{ padding: '40px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🎫 Bilhetes do Dia</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>
            Múltiplas geradas automaticamente a partir dos jogos processados
          </p>
        </div>

        {/* STATUS DOS DADOS */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>📊 Status dos Dados</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Total de Jogos</div>
              <div style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>{games.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Jogos Hoje</div>
              <div style={{ color: C.blue, fontSize: 20, fontWeight: 700 }}>{todayGames.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Múltiplas Geradas</div>
              <div style={{ color: C.green, fontSize: 20, fontWeight: 700 }}>{suggestions.length}</div>
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Box FT Personalizado</div>
              <div style={{ color: customFTBox ? C.green : C.muted, fontSize: 20, fontWeight: 700 }}>
                {customFTBox ? '✅' : '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              onClick={handleAnalyze}
              disabled={!!analyzing || !csvText}
              style={{
                background: analyzing ? C.muted : C.blue,
                color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer',
              }}
            >
              {analyzing ? '⏳ Analisando...' : '🔍 Analisar Múltiplas'}
            </button>

            <button
              onClick={() => setShowFTBoxBuilder(!showFTBoxBuilder)}
              style={{
                background: showFTBoxBuilder ? C.gold : C.surface,
                color: showFTBoxBuilder ? 'white' : C.text,
                border: `1px solid ${C.gold}`,
                borderRadius: 6, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              🔥 Box FT Personalizado
            </button>

            {suggestions.length > 0 && (
              <button
                onClick={handleFetchOdds}
                disabled={!!loadingOdds}
                style={{
                  background: loadingOdds ? C.muted : C.green,
                  color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px',
                  fontSize: 13, fontWeight: 600, cursor: loadingOdds ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingOdds ? '⏳ Buscando odds...' : '💰 Odds Reais'}
              </button>
            )}

            {ignoredMatches.length > 0 && (
              <button
                onClick={handleClearIgnored}
                style={{
                  background: 'transparent', border: `1px solid ${C.muted}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  color: C.muted, cursor: 'pointer',
                }}
              >
                🔄 Restaurar {ignoredMatches.length} jogo(s)
              </button>
            )}
          </div>
        </div>

        {/* 🆕 FT BOX BUILDER */}
        {showFTBoxBuilder && (
          <div style={{ background: C.surface, border: `2px solid ${C.gold}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: C.gold }}>
              🔥 Construtor de Box FT Personalizado
            </h2>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>
              Selecione 2-3 jogos e seus mercados FT. Este box ignora conflitos com outras múltiplas.
            </p>

            <div style={{ display: 'grid', gap: 16, maxHeight: 400, overflowY: 'auto' }}>
              {ftBoxCandidates.map((candidate: any, candidateIndex: number) => {
                const game = candidate.game;
                const gameKey = game.match || `${game.home} x ${game.away}`;
                const isSelected = selectedGames.has(gameKey);
                const ftMarkets = candidate.markets || [];

                if (ftMarkets.length === 0) return null;

                return (
                  <div key={`ftbox-candidate-${candidateIndex}-${gameKey}`} style={{
                    background: isSelected ? `${C.gold}20` : 'transparent',
                    border: `1px solid ${isSelected ? C.gold : C.border}`,
                    borderRadius: 8, padding: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newSelected = new Set(selectedGames);
                          if (e.target.checked) {
                            newSelected.add(gameKey);
                          } else {
                            newSelected.delete(gameKey);
                            // Remover mercados deste jogo
                            const marketsToRemove = Array.from(selectedMarkets).filter(m => m.startsWith(gameKey + '|'));
                            marketsToRemove.forEach(m => selectedMarkets.delete(m));
                          }
                          setSelectedGames(newSelected);
                        }}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{gameKey}</span>
                    </div>

                    {isSelected && (
                      <div style={{ marginLeft: 24, display: 'grid', gap: 6 }}>
                        {ftMarkets.map((market: any, marketIndex: number) => {
                          const isMarketSelected = selectedMarkets.has(market.key);
                          const axisConflict = Array.from(selectedMarkets).some(m => {
                            if (m === market.key) return false;
                            const [, axis] = m.split('|');
                            return axis === market.axis;
                          });

                          return (
                            <div key={market.key} style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isMarketSelected}
                                disabled={axisConflict && !isMarketSelected}
                                onChange={(e) => {
                                  const newMarkets = new Set(selectedMarkets);
                                  if (e.target.checked) {
                                    // Remover outro mercado do mesmo eixo
                                    const toRemove = Array.from(newMarkets).find(m => {
                                      const [, axis] = m.split('|');
                                      return axis === market.axis;
                                    });
                                    if (toRemove) newMarkets.delete(toRemove);
                                    newMarkets.add(market.key);
                                  } else {
                                    newMarkets.delete(market.key);
                                  }
                                  setSelectedMarkets(newMarkets);
                                }}
                                style={{ marginRight: 8, width: 14, height: 14 }}
                              />
                              <span style={{
                                fontSize: 12,
                                color: axisConflict && !isMarketSelected ? C.muted : C.text,
                                textDecoration: axisConflict && !isMarketSelected ? 'line-through' : 'none'
                              }}>
                                {market.label} @ {market.odd}
                                {market.source === 'api-real' && ' 🟢'}
                                {axisConflict && !isMarketSelected && ' (conflito)'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.muted }}>
                {selectedGames.size} jogo(s) selecionado(s) • {selectedMarkets.size} mercado(s)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setSelectedGames(new Set());
                    setSelectedMarkets(new Set());
                    setCustomFTBox(null);
                  }}
                  style={{
                    background: 'transparent', border: `1px solid ${C.muted}`,
                    borderRadius: 6, padding: '8px 16px', fontSize: 12,
                    color: C.muted, cursor: 'pointer',
                  }}
                >
                  Limpar
                </button>
                <button
                  onClick={() => handleGenerateCustomFTBox()}
                  disabled={selectedGames.size < 2 || selectedMarkets.size < 2}
                  style={{
                    background: selectedGames.size >= 2 && selectedMarkets.size >= 2 ? C.gold : C.muted,
                    color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Gerar Box FT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🆕 BOX FT PERSONALIZADO REFORMADO */}
        {!suggestions.find(s => s.type === 'ftbox') && ftBoxCandidates?.length >= 2 && (
          <FTBoxBuilder
            ftBoxCandidates={ftBoxCandidates}
            ftBoxSelections={ftBoxSelections}
            setFtBoxSelections={setFtBoxSelections}
            liveOdd={liveOdd}
            activeCount={activeCount}
            onGenerate={handleGenerateCustomFTBox}
          />
        )}

        {/* 🆕 BOX FT PERSONALIZADO (LEGADO - manter temporariamente) */}
        {customFTBox && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#ff9800', display: 'flex', alignItems: 'center', gap: 8 }}>
                🔥 Box FT Personalizado
              </h2>
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div key={customFTBox.id} style={{
                background: C.surface, border: `2px solid #ff980040`,
                borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ff9800' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ff9800', marginBottom: 2 }}>
                      🔥 Box FT Personalizado
                    </div>
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {new Set(customFTBox.selections?.map((sel: any) => sel.match)).size} jogos · {customFTBox.selections?.length ?? 0} mercados · Stake R$ {customFTBox.suggestedStake?.toFixed(2) ?? '25.00'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#ff9800' }}>
                      {customFTBox.combinedOdd > 0 ? customFTBox.combinedOdd.toFixed(2) : '—'}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11 }}>
                      Retorno R$ {customFTBox.expectedReturn ? customFTBox.expectedReturn.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(
                    customFTBox.selections?.reduce((acc: any, sel: any) => {
                      if (!acc[sel.match]) acc[sel.match] = [];
                      acc[sel.match].push(sel);
                      return acc;
                    }, {}) || {}
                  ).map(([match, sels]: [string, any], j: number) => {
                    const gameOdd = sels.reduce((acc: number, sel: any) => acc * (sel.odd > 1 ? sel.odd : 1), 1);
                    return (
                      <div key={`custom-ft-${match}-${j}`} style={{
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{match}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>Odd jogo: {gameOdd.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sels.map((sel: any, k: number) => (
                            <div key={`custom-ft-sel-${sel.market}-${k}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: C.text }}>{sel.market}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{sel.odd > 1 ? sel.odd.toFixed(2) : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Risco: <strong style={{ color: customFTBox.riskLevel === 'low' ? C.green : customFTBox.riskLevel === 'high' ? C.red : C.gold }}>{customFTBox.riskLevel === 'low' ? 'Baixo' : customFTBox.riskLevel === 'high' ? 'Alto' : 'Médio'}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
                    {customFTBox.riskReward ?? ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BILHETES */}
        {suggestions.length > 0 && (
          <div>
            {sinfoniaCards.length > 0 && (
  <div style={{ marginBottom: 24 }}>

    {/* HEADER DA SEÇÃO */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🐦</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>
          Sinfonia de Pardais
        </span>
        <span style={{
          fontSize: 11, color: '#8b949e',
          background: '#21262d',
          padding: '2px 8px',
          borderRadius: 10,
        }}>
          {sinfoniaCards.length} jogo{sinfoniaCards.length > 1 ? 's' : ''} qualificado{sinfoniaCards.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* NAVEGAÇÃO — só se tiver mais de 1 */}
      {sinfoniaCards.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setSinfoniaIdx(i => Math.max(0, i - 1))}
            disabled={sinfoniaIdx === 0}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: sinfoniaIdx === 0 ? '#444' : '#8b949e',
              padding: '4px 10px',
              cursor: sinfoniaIdx === 0 ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}>
            ◀
          </button>

          <span style={{ fontSize: 12, color: '#8b949e', minWidth: 40, textAlign: 'center' }}>
            {sinfoniaIdx + 1} / {sinfoniaCards.length}
          </span>

          <button
            onClick={() => setSinfoniaIdx(i => Math.min(sinfoniaCards.length - 1, i + 1))}
            disabled={sinfoniaIdx === sinfoniaCards.length - 1}
            style={{
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: sinfoniaIdx === sinfoniaCards.length - 1 ? '#444' : '#8b949e',
              padding: '4px 10px',
              cursor: sinfoniaIdx === sinfoniaCards.length - 1 ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}>
            ▶
          </button>
        </div>
      )}
    </div>

    {/* CARD DO JOGO ATIVO */}
    <SinfoniaCard suggestion={sinfoniaCards[sinfoniaIdx]} />

  </div>
)}

            {/* SESSÃO: MÚLTIPLAS TRADICIONAIS */}
            {suggestions.filter(s => s.type !== 'sinfonia' && s.type !== 'ftbox').length > 0 && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: C.text }}>
                  🎯 Múltiplas Inteligentes
                </h2>
                <div style={{ display: 'grid', gap: 16 }}>
                  {suggestions.filter(s => s.type !== 'sinfonia' && s.type !== 'ftbox').map((s, i) => (
                    <MultipleCard key={s.id ?? `mult-${i}`} s={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* JOGOS NÃO ENCONTRADOS */}
        {showUnmatchedDetails && unmatchedGames.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: C.gold }}>
              ⚠️ Jogos não encontrados na API ({unmatchedGames.length})
            </h2>
            <div style={{ background: C.surface, border: `1px solid ${C.gold}`, borderRadius: 8, padding: 16 }}>
              {unmatchedGames.map((game, i) => (
                <div key={`unmatched-${i}-${game.home || game.homeTeam || 'unknown'}-${game.away || game.awayTeam || 'unknown'}`} style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
                  {game.home || game.homeTeam || '?'} x {game.away || game.awayTeam || '?'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ESTADO VAZIO */}
        {games.length === 0 && (
          <EmptyState
            icon="🎫"
            title="Nenhum jogo carregado"
            subtitle="Carregue o CSV do dia no Admin para gerar bilhetes."
            actionLabel="⚙️ Ir para Admin"
            actionHref="/admin"
          />
        )}
      </div>
    </main>
  );
}
