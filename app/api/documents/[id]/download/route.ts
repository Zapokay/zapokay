// app/api/documents/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { filePathFromFileUrl } from '@/lib/storage-path';
import { toStorageSafeName } from '@/lib/storage-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const isPreview = request.nextUrl.searchParams.get('preview') === 'true';
  // Auth + ownership gate (#10/#2 Brief 1 Task 3). Fetch the documents row with
  // the user's SESSION client so the company-scoped table RLS (documents_select_own)
  // applies: a non-owner — or an unauthenticated caller — gets zero rows. We 404
  // rather than 403 so the endpoint never confirms the existence of other
  // companies' documents. Service-role is used ONLY for the storage read below,
  // after ownership is proven by this fetch.
  const sessionClient = createSessionClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: doc, error } = await sessionClient
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

    // Ownership proven above. The service-role client reads the bytes from
    // storage (unchanged behaviour; bypasses storage RLS, which is fine now
    // that the requester is confirmed to own the document).
    const serviceClient = createServiceClient();
    const { data: fileData, error: dlError } = await serviceClient.storage
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
