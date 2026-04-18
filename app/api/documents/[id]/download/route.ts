// app/api/documents/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { filePathFromFileUrl } from '@/lib/storage-path';
import { toStorageSafeName } from '@/lib/storage-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const isPreview = request.nextUrl.searchParams.get('preview') === 'true';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, title, file_url, file_name, status')
      .eq('id', params.id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const storagePath = filePathFromFileUrl(doc.file_url);
    if (!storagePath) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    const { data: fileData, error: dlError } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (dlError || !fileData) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Derive extension from the storage path (reliable — set at upload time).
    // Falls back to '.pdf' when the path has no extension.
    const dotIdx = storagePath.lastIndexOf('.');
    const slashIdx = storagePath.lastIndexOf('/');
    const ext =
      dotIdx > slashIdx && dotIdx !== -1
        ? storagePath.slice(dotIdx).toLowerCase()
        : '.pdf';
    const isPdf = ext === '.pdf';
    const contentType = isPdf ? 'application/pdf' : 'text/plain; charset=utf-8';

    // Filename for Content-Disposition:
    //   1. doc.file_name (preserves the user's original upload name, incl. accents)
    //   2. doc.title + ext (for older rows where file_name was never stored)
    //   3. 'document' + ext (last-ditch fallback)
    const filename =
      doc.file_name ??
      (doc.title ? `${doc.title}${ext}` : `document${ext}`);

    // HTTP headers are ASCII-only, so use the RFC 5987 dual-filename pattern:
    //   - filename="…"   — ASCII fallback for older clients
    //   - filename*=UTF-8''…  — percent-encoded UTF-8 for modern browsers
    const asciiFilename = toStorageSafeName(filename);
    const encodedFilename = encodeURIComponent(filename);
    const disposition = isPreview ? 'inline' : 'attachment';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${disposition}; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
