// 🧪 API ENDPOINT PARA TESTE POISSON

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode = 'assist', testType = 'single', games } = body;
    
    // Simular analyzer e games (em produção, viriam do estado)
    const mockAnalyzer = {
      buildBingoSeguro: async (games: any[]) => {
        // Simulação do buildBingoSeguro original
        return {
          id: `test-${Date.now()}`,
          selections: [
            {
              match: "Flamengo x Vasco",
              league: "Brasileirão",
              market: "Ambas Marcam — Sim",
              odd: 2.25,
              edge: 15.5,
              confidence: 78
            },
            {
              match: "Palmeiras x Corinthians",
              league: "Brasileirão", 
              market: "Mais de 2.5 gols FT",
              odd: 1.95,
              edge: 12.3,
              confidence: 65
            }
          ],
          combinedOdd: 4.39,
          expectedValue: 0.139
        };
      }
    };
    
    const mockGames = games || [
      { match: "Flamengo x Vasco", league: "Brasileirão" },
      { match: "Palmeiras x Corinthians", league: "Brasileirão" }
    ];
    
    let results;
    
    if (testType === 'ab') {
      // AB test removido - não está no escopo atual
      results = await mockAnalyzer.buildBingoSeguro(mockGames);
    } else {
      // Teste simples sem Poisson integration
      results = await mockAnalyzer.buildBingoSeguro(mockGames);
    }
    
    return NextResponse.json({
      success: true,
      mode,
      testType,
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[POISSON-API] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

// GET endpoint para status
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/test-poisson',
    methods: ['POST'],
    body: {
      mode: 'off | assist | tie_breaker | strict',
      testType: 'single | ab',
      games: 'array de jogos (opcional)'
    },
    examples: {
      single: { mode: 'assist', testType: 'single' },
      ab: { mode: 'assist', testType: 'ab' }
    }
  });
}
