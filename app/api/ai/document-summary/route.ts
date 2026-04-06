import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

interface SummaryKeyPoint {
  title: string;
  explanation: string;
}

interface DocumentSummary {
  title: string;
  purpose: string;
  keyPoints: SummaryKeyPoint[];
  importantDates: string[];
  disclaimer: string;
}

const PUBLIC_MARKER = '/object/public/documents/';
const SIGNED_MARKER = '/object/sign/documents/';

export async function POST(req: NextRequest) {
  try {
    const { documentId, locale } = await req.json();
    if (!documentId) {
      return NextResponse.json({ error: 'documentId required' }, { status: 400 });
    }

    const supabase = createClient();

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check cache
    const cacheKey = locale === 'fr' ? 'ai_summary_fr' : 'ai_summary_en';
    const cached = document[cacheKey] as DocumentSummary | null;
    if (cached) {
      return NextResponse.json({ summary: cached, cached: true });
    }

    if (!document.file_url) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 });
    }

    // Extract storage path from file_url
    let storagePath: string | null = null;
    const publicIdx = (document.file_url as string).indexOf(PUBLIC_MARKER);
    const signedIdx = (document.file_url as string).indexOf(SIGNED_MARKER);
    if (publicIdx !== -1) {
      storagePath = (document.file_url as string).slice(publicIdx + PUBLIC_MARKER.length);
    } else if (signedIdx !== -1) {
      storagePath = (document.file_url as string).slice(signedIdx + SIGNED_MARKER.length);
    }

    if (!storagePath) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 });
    }

    // Generate signed URL via service role (bypasses private bucket)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 })
    }
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    );
    const { data: signedData, error: signedError } = await supabaseAdmin
      .storage
      .from('documents')
      .createSignedUrl(storagePath, 60);

    if (signedError || !signedData?.signedUrl) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 });
    }

    // Fetch PDF and encode as base64 for Claude's native PDF support
    const pdfResponse = await fetch(signedData.signedUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 });
    }
    const pdfBase64 = Buffer.from(await pdfResponse.arrayBuffer()).toString('base64');

    // Send PDF directly to Claude — no text extraction needed
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `Tu es l'assistant de ZapOkay. Tu crées des résumés de documents corporatifs. Tu réponds UNIQUEMENT en JSON valide, sans texte avant ni après.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `Analyse ce document corporatif et retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "title": "titre court du document",
  "purpose": "à quoi sert ce document en 1-2 phrases simples",
  "keyPoints": [
    {"title": "Point clé", "explanation": "explication simple"}
  ],
  "importantDates": ["date extraite"],
  "disclaimer": "${locale === 'fr'
    ? 'Ce résumé est indicatif et ne remplace pas le document original.'
    : 'This summary is indicative and does not replace the original document.'}"
}
Réponds en ${locale === 'fr' ? 'français' : 'anglais'}.
UNIQUEMENT le JSON — aucun texte avant ou après.`,
            },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 503 });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    let summary: DocumentSummary;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      summary = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      return NextResponse.json({ error: 'summary_unavailable' }, { status: 422 });
    }

    // Save to cache
    await supabase
      .from('documents')
      .update({ [cacheKey]: summary })
      .eq('id', documentId);

    return NextResponse.json({ summary, cached: false });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
