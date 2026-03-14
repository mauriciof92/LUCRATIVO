'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '../../components/NavHeader';
import { supabase } from '../../lib/supabase';
import { loadStoredBacktest } from '../../lib/storage';
import { C } from '../../components/ui';

export default function SuggestionsIA() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    async function loadHighScoreGames() {
      try {
        // ✅ Tentar primeiro da tabela lucrativo_games (UPSERT)
        const { data: supabaseGames, error: supabaseError } = await supabase
          .from('lucrativo_games')
          .select('*')
          .gte('score', 0.6) // Elite: score ≥ 60%
          .eq('status', 'pending')
          .order('score', { ascending: false })
          .limit(20);

        if (supabaseGames && supabaseGames.length > 0) {
          // ✅ Dados da tabela lucrativo_games disponíveis
          console.log('[SUGGESTIONS-IA] Usando dados da tabela lucrativo_games:', supabaseGames.length);
          setGames(supabaseGames);
        } else {
          // ✅ Fallback para dados do backtest local (como outras páginas)
          console.log('[SUGGESTIONS-IA] Tabela vazia, usando fallback do backtest local');
          const stored = await loadStoredBacktest();
          
          if (stored && stored.results) {
            // Filtrar jogos elite do backtest
            const eliteGames = stored.results
              .filter((r: any) => {
                const score = Number(r.score || 0);
                return score >= 0.6 && r.status === 'pending';
              })
              .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
              .slice(0, 20)
              .map((r: any) => ({
                ...r,
                game_id: r.id,
                home: r.match?.split(' x ')?.[0]?.trim() || '',
                away: r.match?.split(' x ')?.[1]?.trim() || '',
                league: r.league || '',
                hour: r.hour || '',
                score: r.score || 0,
                exg: r.exG || 0,
                exc: r.exC || 0,
                af_h: r.afH || 50,
                af_a: r.afA || 50,
                main_market: r.mainMarket ? JSON.stringify(r.mainMarket) : null
              }));

            console.log('[SUGGESTIONS-IA] Dados do backtest:', eliteGames.length);
            setGames(eliteGames);
          } else {
            console.log('[SUGGESTIONS-IA] Nenhum dado encontrado');
            setGames([]);
          }
        }

        setLoading(false);
      } catch (err: any) {
        console.error('[SUGGESTIONS-IA] Erro ao carregar jogos:', err);
        setError(err.message || 'Erro ao carregar dados');
        setLoading(false);
      }
    }

    loadHighScoreGames();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 20 }}>
        <NavHeader activePage="/suggestions-ia" />
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', padding: '100px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🎯</div>
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>Sugestões IA</h1>
          <p>Buscando jogos elite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 20 }}>
        <NavHeader activePage="/suggestions-ia" />
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', padding: '100px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>Erro ao Carregar</h1>
          <p style={{ color: '#f85149', marginBottom: 20 }}>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            style={{ background: C.blue, color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', fontSize: 16, marginRight: 10 }}
          >
            Recarregar
          </button>
          <button 
            onClick={() => router.push('/admin')}
            style={{ background: C.gray, color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', fontSize: 16 }}
          >
            Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 20 }}>
      <NavHeader activePage="/suggestions-ia" />
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, marginBottom: 24 }}>🎯 Sugestões IA</h1>
        
        {games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⚡</div>
            <h2>Nenhum jogo elite disponível</h2>
            <p style={{ marginBottom: 16 }}>Faça upload de CSV no Admin ou importe dados para gerar sugestões!</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => router.push('/admin')}
                style={{ background: C.blue, color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', fontSize: 16 }}
              >
                📊 Admin (Upload CSV)
              </button>
              <button 
                onClick={() => router.push('/backtest')}
                style={{ background: '#3fb950', color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', fontSize: 16 }}
              >
                🎯 Backtest (Importar)
              </button>
              <button 
                onClick={() => window.location.reload()}
                style={{ background: C.gray, color: 'white', padding: '12px 24px', borderRadius: 8, border: 'none', fontSize: 16 }}
              >
                🔄 Recarregar
              </button>
            </div>
            <div style={{ marginTop: 20, fontSize: 14, color: C.muted }}>
              <p><strong>Dicas:</strong></p>
              <p>• Use o Admin para fazer UPSERT de jogos na tabela única</p>
              <p>• Ou importe CSV no Backtest para usar dados locais</p>
              <p>• Jogos com score ≥ 60% aparecem como sugestões elite</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
            {games.map((game, i) => (
              <div key={game.game_id || game.id || i} style={{ 
                background: C.surface, 
                border: `1px solid ${C.border}`, 
                borderRadius: 12, 
                padding: 20 
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
                  {game.home} x {game.away}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: '#3fb950', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
                    Score: {(game.score * 100).toFixed(1)}%
                  </div>
                  <div style={{ background: '#f0c040', color: 'black', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
                    {game.league}
                  </div>
                  <div style={{ background: C.gray, color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
                    {game.hour}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: C.muted }}>
                  xG: {game.exg?.toFixed(2)} | xC: {game.exc?.toFixed(1)} | AF: {game.af_h?.toFixed(1)}/{game.af_a?.toFixed(1)}
                </div>
                {game.main_market && (
                  <div style={{ marginTop: 12, padding: 12, background: '#1a1f2e20', borderRadius: 8 }}>
                    <strong>Mercado Principal:</strong> {JSON.parse(game.main_market).label} @ {JSON.parse(game.main_market).odd?.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
