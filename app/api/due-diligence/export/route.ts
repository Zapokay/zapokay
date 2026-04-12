export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

/* ------------------------------------------------------------------ */
/*  Section mapping                                                    */
/* ------------------------------------------------------------------ */

interface SectionConfig {
  folder: string;
  label: string;
}

const SECTION_MAP: Record<string, SectionConfig> = {
  statuts: { folder: '01_Statuts', label: 'Statuts' },
  registre: { folder: '02_Reglements', label: 'Règlements' },
  resolution: { folder: '03_Resolutions', label: 'Résolutions' },
  pv: { folder: '03_Resolutions', label: 'Résolutions' },
  rapport: { folder: '04_Rapports', label: 'Rapports' },
};

const DEFAULT_SECTION: SectionConfig = { folder: '05_Autres', label: 'Autres' };

function getSectionConfig(documentType: string): SectionConfig {
  return SECTION_MAP[documentType] ?? DEFAULT_SECTION;
}

/* ------------------------------------------------------------------ */
/*  Cover page (HTML → PDF via generatePDF)                            */
/* ------------------------------------------------------------------ */

interface CoverPageData {
  companyName: string;
  neq: string;
  exportDate: string;
  completionScore: number;
  totalRequired: number;
  totalComplete: number;
  sectionCounts: Record<string, number>;
}

async function generateCoverPage(data: CoverPageData): Promise<Buffer> {
  const { generatePDF } = await import('@/lib/pdf/generatePDF');

  return generatePDF({
    type: 'cover-page',
    data: {
      companyName: data.companyName,
      neq: data.neq,
      exportDate: data.exportDate,
      completionScore: data.completionScore,
      totalRequired: data.totalRequired,
      totalComplete: data.totalComplete,
      sectionCounts: data.sectionCounts,
      language: 'fr',
    },
  });
}

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId est requis.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuration Supabase manquante.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Charger l'entreprise ---------- */

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, legal_name_fr, neq')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Entreprise introuvable.' },
        { status: 404 }
      );
    }

    /* ---------- Charger les documents actifs ---------- */

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, document_type, title, file_name, storage_path')
      .eq('company_id', companyId)
      .eq('status', 'active');

    if (docsError) {
      console.error('Documents fetch error:', docsError);
      return NextResponse.json(
        { error: 'Impossible de charger les documents.' },
        { status: 500 }
      );
    }

    const allDocuments = documents ?? [];

    /* ---------- Charger les exigences pour le score ---------- */

    const { data: requirements } = await supabase
      .from('minute_book_requirements')
      .select('id')
      .eq('company_id', companyId);

    const totalRequired = (requirements ?? []).length;
    const totalComplete = allDocuments.length;
    const completionScore =
      totalRequired > 0 ? Math.round((totalComplete / totalRequired) * 100) : 0;

    /* ---------- Organiser par section ---------- */

    const sectionCounts: Record<string, number> = {};

    const zip = new JSZip();

    for (const doc of allDocuments) {
      const section = getSectionConfig(doc.document_type);

      // Compteur par section
      sectionCounts[section.label] = (sectionCounts[section.label] ?? 0) + 1;

      // Télécharger le fichier depuis Supabase Storage
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 60); // 60 secondes

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error(`Signed URL error for ${doc.storage_path}:`, signedUrlError);
        continue;
      }

      const fileResponse = await fetch(signedUrlData.signedUrl);
      if (!fileResponse.ok) {
        console.error(`Download failed for ${doc.file_name}: ${fileResponse.status}`);
        continue;
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      const safeName = doc.file_name.replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_');

      zip.file(`${section.folder}/${safeName}`, fileBuffer);
    }

    /* ---------- Page de garde ---------- */

    const now = new Date();
    const exportDate = now.toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const coverPageBuffer = await generateCoverPage({
      companyName: company.legal_name_fr,
      neq: company.neq,
      exportDate,
      completionScore,
      totalRequired,
      totalComplete,
      sectionCounts,
    });

    zip.file('00_Page_de_garde.pdf', coverPageBuffer);

    /* ---------- Générer le ZIP ---------- */

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    /* ---------- Réponse ---------- */

    const sanitizedCompanyName = company.legal_name_fr
      .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 40);

    const dateStr = now.toISOString().split('T')[0];
    const downloadFileName = `livre-minutes-${sanitizedCompanyName}-${dateStr}.zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${downloadFileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('due-diligence/export error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
