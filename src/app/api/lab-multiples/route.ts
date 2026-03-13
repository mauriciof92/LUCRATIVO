import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { generateSmartMultiples, getCalibratedLambdas } from '../../../lib/poisson-engine';

// POST para gerar múltiplas a partir de linhas CSV
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[LAB-POST] Keys recebidas:', Object.keys(body));

    // INTENT: SALVAR no Supabase
    // Detecta pelo campo "type" que vem do botão Salvar
    if (body.type && body.legs) {
      const { type, legs, combined_prob, combined_fair_odd } = body;

      if (!type || !legs || combined_prob == null || combined_fair_odd == null) {
        return NextResponse.json({ error: 'Campos obrigatórios ausentes para salvar' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('lab_multiples')
        .insert([{ type, legs, combined_prob, combined_fair_odd, status: 'PENDING' }])
        .select()
        .single();

      if (error) {
        console.error('[LAB-SAVE-ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log('[LAB-SAVE] Salvo com sucesso:', data.id);
      return NextResponse.json({ success: true, id: data.id });
    }

    // INTENT: GERAR múltiplas (recebe CSV)
    console.log('[LAB-DEBUG] Tentando parsing com body:', typeof body);
    console.log('[LAB-DEBUG] body.csvLines:', typeof body.csvLines, Array.isArray(body.csvLines), body.csvLines?.length);
    
    const csvData: string[][] =
      Array.isArray(body) ? body :
      Array.isArray(body.csvRows) ? body.csvRows :
      Array.isArray(body.rows) ? body.rows :
      Array.isArray(body.data) ? body.data :
      Array.isArray(body.lines) ? body.lines :
      body.csvLines ?? body.rows ?? body.data ?? body.lines ?? [];

    console.log('[LAB-DEBUG] csvData result:', typeof csvData, Array.isArray(csvData), csvData.length);
    console.log('[LAB-DEBUG] Primeira linha:', csvData[0]?.slice(0, 5));

    if (csvData.length === 0) {
      console.error('[LAB-ERROR] Falha no parsing. Body disponível:', Object.keys(body));
      console.error('[LAB-ERROR] body.csvLines type:', typeof body.csvLines);
      console.error('[LAB-ERROR] body.csvLines value:', body.csvLines);
      return NextResponse.json({ error: 'Payload inválido — sem csvData nem type+legs' }, { status: 400 });
    }

    const resultado = generateSmartMultiples(csvData);
    console.log('[LAB-MULTIPLES] Gerado:', { triplaCS: resultado.triplaCS.length, variacoes1X2: resultado.variacoes1X2.length });
    return NextResponse.json(resultado);
    
  } catch (error: any) {
    console.error('[LAB-API-ERROR]', error?.message, error?.stack);
    return NextResponse.json(
      { error: error?.message ?? 'Erro desconhecido', stack: error?.stack },
      { status: 500 }
    );
  }
}

// GET para listar múltiplas salvas (opcional, para consulta)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    
    let query = supabase
      .from('lab_multiples')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[LAB-MULTIPLES] Erro ao consultar:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('[LAB-MULTIPLES] Erro geral no GET:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
