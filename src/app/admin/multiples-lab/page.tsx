"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NavHeader } from "../../../components/NavHeader";
import { C, KPI as SharedKPI } from "../../../components/ui";
import { Upload, Beaker, Save, AlertTriangle, CheckCircle } from "lucide-react";

interface Leg {
  matchName: string;
  selection: string;
  prob: number;
  fairOdd: number;
}

interface MultipleResult {
  legs: Leg[];
  combined_prob: number;
  combined_fair_odd: number;
}

interface LabResults {
  triplaCS: MultipleResult;
  variacoes1X2: MultipleResult[];
}

export default function MultiplesLabPage() {
  const router = useRouter();
  
  // Estados para CSV e processamento
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvLines, setCsvLines] = useState<string[][]>([]);
  const [csvPreview, setCsvPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Estados para salvamento com feedback visual
  const [saveStatus, setSaveStatus] = useState<{[key: string]: 'idle' | 'saving' | 'saved' | 'error'}>({});
  const [error, setError] = useState<string>('');
  
  // Funções auxiliares para cálculo de probabilidades combinadas
  const calculateCombinedProb = (legs: any[]) => {
    return legs.reduce((acc, leg) => acc * leg.prob, 1);
  };

  const calculateCombinedFairOdd = (legs: any[]) => {
    return 1 / calculateCombinedProb(legs);
  };

  // Handler de seleção do CSV (reutilizando fluxo do Admin)
  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setResults(null);
    setError('');
    
    // Ler e parsear CSV para array de linhas
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        
        // CORREÇÃO OBRIGATÓRIA — parseLabCSV para dividir por ';'
        const parseLabCSV = (raw: string): string[][] => {
          return raw
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
              // Remove aspas externas se existirem e divide por ;
              const clean = line.replace(/^"|"$/g, '');
              return clean.split(';').map(col => col.replace(/^"|"$/g, '').trim());
            });
        };
        
        const lines = parseLabCSV(text);
        setCsvLines(lines);
        setCsvPreview(`${lines.length} jogos encontrados`);
        console.log('[LAB] CSV parseado:', lines.length, 'linhas');
      } catch (err) {
        setError('Erro ao ler CSV. Verifique o formato.');
        console.error('[LAB] Erro ao parsear CSV:', err);
      }
    };
    reader.readAsText(file);
  };
  
  // Gerar múltiplas via API
  const generateMultiples = async () => {
    if (!csvLines.length) {
      setError('Selecione um arquivo CSV primeiro.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // CORREÇÃO 1 — LOG CLIENT-SIDE ANTES DE ENVIAR
      const primeiraLinha = csvLines[1]; // pula o header
      console.log('[CSV-ROW-DEBUG] col[5]:', primeiraLinha?.[5]);
      console.log('[CSV-ROW-DEBUG] col[8]:', primeiraLinha?.[8]);
      console.log('[CSV-ROW-DEBUG] col[15]:', primeiraLinha?.[15]);
      console.log('[CSV-ROW-DEBUG] col[25]:', primeiraLinha?.[25]);
      console.log('[CSV-ROW-DEBUG] col[30]:', primeiraLinha?.[30]);
      console.log('[CSV-ROW-DEBUG] linha completa:', primeiraLinha);
      
      console.log('[LAB] Enviando', csvLines.length, 'linhas para processamento');
      
      const response = await fetch('/api/lab-multiples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvLines })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // CORREÇÃO 3 — LOG DO RETORNO DA API NO FRONTEND
      console.log('[API-RESPONSE-DEBUG]', data._debug);
      
      setResults(data);
      console.log('[LAB] Múltiplas geradas:', {
        triplaCS: data.triplaCS?.length || 0,
        variacoes1X2: data.variacoes1X2?.length || 0
      });
      
    } catch (err: any) {
      setError('❌ Erro ao gerar múltiplas: ' + (err?.message || String(err)));
      console.error('[LAB] Erro na API:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Salvar múltipla no Supabase com status do botão
  const saveMultiple = async (type: string, legs: Leg[], combinedProb: number, combinedFairOdd: number) => {
    setSaveStatus(prev => ({ ...prev, [type]: 'saving' }));
    setError('');
    
    try {
      console.log('[LAB] Salvando múltipla:', type, 'com', legs.length, 'pernas');
      
      const response = await fetch('/api/lab-multiples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          legs,
          combined_prob: combinedProb,
          combined_fair_odd: combinedFairOdd
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao salvar');
      }
      
      setSaveStatus(prev => ({ ...prev, [type]: 'saved' }));
      console.log('[LAB] Múltipla salva com sucesso:', type);
      
    } catch (err: any) {
      setSaveStatus(prev => ({ ...prev, [type]: 'error' }));
      setError('❌ Erro ao salvar: ' + (err?.message || String(err)));
      console.error('[LAB] Erro ao salvar:', err);
    }
  };
  
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      
      <NavHeader activePage="/admin/multiples-lab" subtitle="Laboratório de Múltiplas" />

      <div style={{ padding: '40px' }}>
        
        {/* Erro */}
        {error && (
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
            {error}
          </div>
        )}

        {/* Título */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Beaker size={32} color={C.accent} />
            Laboratório de Múltiplas
          </h1>
          <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>
            Geração de múltiplas com modelo Poisson calibrado (Força Relativa + xG + Dixon-Coles)
          </p>
        </div>

        {/* Upload CSV */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <Upload size={20} color={C.accent} />
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
              📥 Carregar CSV do Dia
            </h2>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: 'block', color: C.muted, fontSize: 13, marginBottom: 8 }}>
              Selecione o CSV do PackBall (jogos NS do dia)
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

          <button
            onClick={generateMultiples}
            disabled={loading || csvLines.length === 0}
            style={{
              background: csvLines.length > 0 && !loading ? C.green : C.gray,
              color: csvLines.length > 0 && !loading ? '#fff' : '#555',
              border: 'none', borderRadius: 8,
              padding: '12px 28px', fontSize: 14,
              fontWeight: 700, cursor: csvLines.length > 0 ? 'pointer' : 'not-allowed',
              width: '100%',
            }}
          >
            {loading ? '🔄 Gerando Múltiplas...' : '🎯 Gerar Múltiplas'}
          </button>
        </div>

        {/* Resultados */}
        {results && (
          <>
            {/* 🔮 Tripla de Placar Exato */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <Beaker size={20} color={C.accent} />
                <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
                  🔮 Tripla de Placar Exato
                </h2>
              </div>

              {(results?.triplaCS as unknown as any[]).map((leg: any, i: any) => (
                <div key={i} style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  fontSize: 13
                }}>
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>
                    {leg.matchName}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: C.muted }}>
                      Placar: <strong>{leg.selection}</strong>
                    </span>
                    <span style={{ color: C.accent }}>
                      {(leg.prob * 100).toFixed(1)}% · Odd Justa {leg.fairOdd.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}

              <div style={{
                background: '#0d2818',
                border: `1px solid ${C.green}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                textAlign: 'center'
              }}>
                <div style={{ color: C.green, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                  Multiplicador Total
                </div>
                <div style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>
                  {(results?.triplaCS?.combined_fair_odd || 0).toFixed(2)}
                </div>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  Probabilidade: {((results?.triplaCS?.combined_prob || 0) * 100).toFixed(2)}%
                </div>
              </div>

              <button
                onClick={() => saveMultiple('CORRECT_SCORE', results?.triplaCS as unknown as any[], calculateCombinedProb(results?.triplaCS as unknown as any[]), calculateCombinedFairOdd(results?.triplaCS as unknown as any[]))}
                disabled={saveStatus['CORRECT_SCORE'] === 'saving' || saveStatus['CORRECT_SCORE'] === 'saved'}
                style={{
                  background: saveStatus['CORRECT_SCORE'] === 'saved' ? C.green : 
                             saveStatus['CORRECT_SCORE'] === 'saving' ? C.gray : C.accent,
                  color: saveStatus['CORRECT_SCORE'] === 'saved' ? '#fff' : '#000',
                  border: 'none', borderRadius: 8,
                  padding: '12px 24px', fontSize: 14,
                  fontWeight: 700, cursor: saveStatus['CORRECT_SCORE'] === 'saved' ? 'not-allowed' : 'pointer',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                {saveStatus['CORRECT_SCORE'] === 'saved' && <CheckCircle size={16} />}
                {saveStatus['CORRECT_SCORE'] === 'saved' ? 'Salvo ✓' : 
                 saveStatus['CORRECT_SCORE'] === 'saving' ? 'Salvando...' : 
                 'Salvar no Supabase (Shadow Bet)'}
              </button>
            </div>

            {/* 🎯 Lista Dinâmica 1X2 */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <Beaker size={20} color={C.accent} />
                <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: C.text }}>
                  🎯 Lista Dinâmica 1X2 (Desdobramentos)
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {results.variacoes1X2.map((variacao: any, varIndex: any) => (
                  <div key={varIndex} style={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: 16
                  }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12, textAlign: 'center' }}>
                      {varIndex === 0 ? 'Bilhete Lógico (Seco)' : 
                       varIndex === 1 ? 'Proteção 1 Empate' : 
                       'Proteção 2 Empates'}
                    </h3>

                    {(variacao as unknown as any[]).map((leg: any, i: any) => (
                      <div key={i} style={{ 
                        background: leg.selection === 'Empate' ? '#f0c040' : 'transparent',
                        padding: '6px 8px',
                        margin: '4px 0',
                        borderRadius: 4,
                        fontSize: 12,
                        lineHeight: 1.4
                      }}>
                        <div style={{ fontWeight: 500, color: leg.selection === 'Empate' ? '#000' : C.text }}>
                          {leg.matchName}
                        </div>
                        <div style={{ color: leg.selection === 'Empate' ? '#000' : C.muted }}>
                          {leg.selection} · {(leg.prob * 100).toFixed(1)}% · {leg.fairOdd.toFixed(2)}
                        </div>
                      </div>
                    ))}

                    <div style={{
                      background: '#1a1a1a',
                      borderRadius: 4,
                      padding: 8,
                      marginTop: 12,
                      textAlign: 'center'
                    }}>
                      <div style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>
                        Odd Justa Total
                      </div>
                      <div style={{ color: C.accent, fontSize: 16, fontWeight: 700 }}>
                        {(variacao?.combined_fair_odd || 0).toFixed(2)}
                      </div>
                      <div style={{ color: C.muted, fontSize: 10 }}>
                        {((variacao?.combined_prob || 0) * 100).toFixed(2)}%
                      </div>
                    </div>

                    <button
                      onClick={() => saveMultiple(`MATCH_ODDS_VAR_${varIndex + 1}`, variacao as unknown as any[], calculateCombinedProb(variacao as unknown as any[]), calculateCombinedFairOdd(variacao as unknown as any[]))}
                      disabled={saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saving' || saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved'}
                      style={{
                        background: saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved' ? C.green : 
                                   saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saving' ? C.gray : C.accent,
                        color: saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved' ? '#fff' : '#000',
                        border: 'none', borderRadius: 6,
                        padding: '8px 16px', fontSize: 12,
                        fontWeight: 600, cursor: saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved' ? 'not-allowed' : 'pointer',
                        width: '100%',
                        marginTop: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      {saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved' && <CheckCircle size={12} />}
                      {saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saved' ? 'Salvo ✓' : 
                       saveStatus[`MATCH_ODDS_VAR_${varIndex + 1}`] === 'saving' ? 'Salvando...' : 
                       'Salvar Variação'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
