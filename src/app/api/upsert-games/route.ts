// ✅ /app/api/upsert-games/route.ts - SCHEMA REAL (sem raw_data)
import { supabaseServer } from '../../../lib/supabase';

export async function POST(req: Request) {
  const { csvText, date } = await req.json();
  const lines = csvText.split('\n').slice(1);
  
  const games = lines.map((line: string) => {
    const cols = line.split(',');
    return {
      game_id: `${cols[0]}-${cols[1]}-${date}`, // home-away-date PK
      date, 
      league: cols[3], 
      home: cols[0], 
      away: cols[1],
      hour: cols[4],
      exg: parseFloat(cols[6] || '2.5'),
      // ❌ SEM raw_data (coluna não existe na tabela)
      // ✅ Apenas colunas existentes
      score: parseFloat(cols[20] || '0.6'), // Engine score
      updated_at: new Date().toISOString()
    };
  }).filter((g: any) => g.game_id); // Válidos

  const { data, error } = await supabaseServer
    .from('lucrativo_games')
    .upsert(games, { onConflict: 'game_id' });

  return error 
    ? Response.json({ error: error.message }, { status: 500 })
    : Response.json({ success: true, total: (data as unknown as any[])?.length || 0 });
}
