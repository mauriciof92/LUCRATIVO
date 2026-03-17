import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { generateSmartMultiples } from '../../../lib/poisson-engine';

// POST: gerar múltiplas (CSV) ou salvar no Supabase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // INTENT: SALVAR — identificado pelo campo explícito "intent"
    // ou pela presença de type + legs sem csvLines/csvRows
    const isSaveIntent =
      body.intent === 'save' ||
      (body.type && body.legs && !body.csvLines && !body.csvRows && !body.rows && !body.data && !body.lines);

    if (isSaveIntent) {
      const { type, legs, combined_prob, combined_fair_odd } = body;

      if (!type || !legs || combined_prob == null || combined_fair_odd == null) {
        return NextResponse.json(
          { error: 'Campos obrigatórios ausentes: type, legs, combined_prob, combined_fair_odd' },
          { status: 400 }
        );
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

      return NextResponse.json({ success: true, id: data.id });
    }

    // INTENT: GERAR múltiplas — recebe linhas do CSV
    let csvData: string[][] | null = null;

    if (Array.isArray(body))             csvData = body;
    else if (Array.isArray(body.csvLines)) csvData = body.csvLines;
    else if (Array.isArray(body.csvRows))  csvData = body.csvRows;
    else if (Array.isArray(body.rows))     csvData = body.rows;
    else if (Array.isArray(body.data))     csvData = body.data;
    else if (Array.isArray(body.lines))    csvData = body.lines;

    if (!csvData || csvData.length === 0) {
      console.error('[LAB-ERROR] Payload inválido. Keys recebidas:', Object.keys(body));
      return NextResponse.json(
        { error: 'Payload inválido — envie csvLines (array de arrays) ou type+legs para salvar' },
        { status: 400 }
      );
    }

    const resultado = generateSmartMultiples(csvData);
    return NextResponse.json(resultado);

  } catch (error: any) {
    console.error('[LAB-API-ERROR]', error?.message);
    return NextResponse.json(
      { error: error?.message ?? 'Erro desconhecido' },
      { status: 500 }
    );
  }
}

// GET: listar múltiplas salvas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type   = searchParams.get('type');
    const status = searchParams.get('status');

    let query = supabase
      .from('lab_multiples')
      .select('*')
      .order('created_at', { ascending: false });

    if (type)   query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      console.error('[LAB-GET-ERROR]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[LAB-GET-ERROR]', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
