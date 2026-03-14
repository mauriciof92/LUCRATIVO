import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { data, csv_text } = await request.json();
    
    if (!csv_text?.trim()) {
      return NextResponse.json({ error: 'CSV vazio' }, { status: 400 });
    }

    const { data: upsert, error } = await supabase
      .from('csv_diario')
      .upsert({ 
        data: data || null, 
        csv_text: csv_text.trim(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('[CSV-DIARIO] Erro no upsert:', error);
      return NextResponse.json({ error: 'Erro no upsert', details: error.message }, { status: 500 });
    }

    console.log('[CSV-DIARIO] Upsert realizado com sucesso:', { 
      records: upsert?.length || 0,
      csvLength: csv_text.length 
    });

    return NextResponse.json({ 
      success: true, 
      data: upsert,
      message: 'CSV salvo com sucesso'
    });

  } catch (error) {
    console.error('[CSV-DIARIO] Erro na API:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // formato DDMM

    let query = supabase
      .from('csv_diario')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CSV-DIARIO] Erro na consulta:', error);
      return NextResponse.json({ error: 'Erro na consulta', details: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ 
        error: 'Nenhum CSV encontrado',
        message: date ? `Nenhum CSV encontrado para a data ${date}` : 'Nenhum CSV encontrado'
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      data: data[0],
      message: 'CSV recuperado com sucesso'
    });

  } catch (error) {
    console.error('[CSV-DIARIO] Erro na API GET:', error);
    return NextResponse.json({ 
      error: 'Erro interno', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
