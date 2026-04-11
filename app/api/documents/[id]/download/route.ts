// app/api/documents/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('file_name, storage_path, content_type')
      .eq('id', params.id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data: fileData, error: dlError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path);

    if (dlError || !fileData) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const isPdf = doc.file_name.endsWith('.pdf');
    const contentType = isPdf ? 'application/pdf' : 'text/plain; charset=utf-8';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${doc.file_name}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
