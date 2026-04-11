// app/api/documents/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePDF } from '@/lib/pdf-generator';
import { boardResolutionHTML } from '@/lib/pdf-templates/resolution-board';
import { shareholderResolutionHTML } from '@/lib/pdf-templates/resolution-shareholder';
import { annualRegisterHTML } from '@/lib/pdf-templates/annual-register';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type DocumentType = 'board-resolution' | 'shareholder-resolution' | 'annual-register';

function buildTitle(type: DocumentType, data: Record<string, unknown>): string {
  const fy = typeof data.fiscalYear === 'string' ? data.fiscalYear : '';
  const suffix = fy ? ` — ${fy}` : '';
  const resolutions = Array.isArray(data.resolutions) ? data.resolutions as { title?: string }[] : [];
  const firstTitle = typeof resolutions[0]?.title === 'string' ? resolutions[0].title : null;

  switch (type) {
    case 'board-resolution':
      return firstTitle ?? `Résolution du conseil d'administration${suffix}`;
    case 'shareholder-resolution':
      return firstTitle ?? `Résolution des actionnaires${suffix}`;
    case 'annual-register':
      return `Registre annuel${suffix}`;
  }
}

function mapToDocumentType(type: string): string {
  const map: Record<string, string> = {
    'board-resolution': 'resolution',
    'shareholder-resolution': 'resolution',
    'annual-register': 'registre',
    'cover-page': 'autre',
  };
  return map[type] ?? 'autre';
}

function buildHTML(type: DocumentType, data: Record<string, unknown>): string {
  switch (type) {
    case 'board-resolution':
      return boardResolutionHTML(data as unknown as Parameters<typeof boardResolutionHTML>[0]);
    case 'shareholder-resolution':
      return shareholderResolutionHTML(data as unknown as Parameters<typeof shareholderResolutionHTML>[0]);
    case 'annual-register':
      return annualRegisterHTML(data as unknown as Parameters<typeof annualRegisterHTML>[0]);
    default:
      throw new Error(`Unknown document type: ${type satisfies never}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: DocumentType;
      data: Record<string, unknown>;
      companyId: string;
    };

    const { type, data, companyId } = body;

    const html = buildHTML(type, data);
    const pdfBuffer = await generatePDF(html);

    const fileName = `${type}-${Date.now()}.pdf`;
    const storagePath = `${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Save reference in DB
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({
        company_id: companyId,
        title: buildTitle(type, data),
        document_type: mapToDocumentType(type),
        file_name: fileName,
        file_url: storagePath,
        file_size: pdfBuffer.length,
        language: (data.language as string) ?? 'fr',
        status: 'active',
        source: 'generated',
        framework: (data.incorporationType as string) === 'CBCA' ? 'CBCA' : 'LSA',
        document_year: new Date().getFullYear(),
      })
      .select('id')
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ id: doc.id, fileName });
  } catch (err) {
    console.error('Generate route error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
