export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Mapping requirementKey → document type + resolutionType           */
/* ------------------------------------------------------------------ */

interface DocMapping {
  type: string;
  resolutionType: string;
}

const REQUIREMENT_MAP: Record<string, DocMapping> = {
  // LSAQ
  lsaq_premiere_resolution_ca:               { type: 'board-resolution',        resolutionType: 'founding_board' },
  lsaq_premiere_resolution_actionnaires:     { type: 'shareholder-resolution',  resolutionType: 'founding_shareholder' },
  lsaq_souscription_actions:                 { type: 'board-resolution',        resolutionType: 'share_subscription' },
  lsaq_annual_board_resolution:              { type: 'board-resolution',        resolutionType: 'annual_board' },
  lsaq_annual_shareholder_resolution:        { type: 'shareholder-resolution',  resolutionType: 'annual_shareholder' },
  lsaq_auditor_waiver:                       { type: 'shareholder-resolution',  resolutionType: 'auditor_waiver' },
  // CBCA
  cbca_first_board_resolution:               { type: 'board-resolution',        resolutionType: 'founding_board' },
  cbca_first_shareholder_resolution:         { type: 'shareholder-resolution',  resolutionType: 'founding_shareholder' },
  cbca_share_subscription:                   { type: 'board-resolution',        resolutionType: 'share_subscription' },
  // Non générables — exclues explicitement
  // lsaq_acceptation_mandat, cbca_director_acceptance → canGenerate: false
};

function getDocumentType(
  requirementKey: string
): { type: string; resolutionType: string; canGenerate: true } | { canGenerate: false } {
  const entry = REQUIREMENT_MAP[requirementKey];
  if (!entry) return { canGenerate: false };
  return { ...entry, canGenerate: true };
}

/* ------------------------------------------------------------------ */
/*  Résolutions par resolutionType                                     */
/* ------------------------------------------------------------------ */

interface Resolution {
  number: number;
  title: string;
  body: string;
}

function getResolutionsForType(resolutionType: string): Resolution[] {
  const map: Record<string, Resolution[]> = {
    founding_board: [
      {
        number: 1,
        title: 'Adoption des statuts',
        body: 'Les statuts de constitution de la société sont pris en note et versés au registre.',
      },
      {
        number: 2,
        title: 'Adoption du règlement intérieur',
        body: "Le règlement intérieur n° 1 régissant les affaires internes de la société est adopté et versé au registre.",
      },
      {
        number: 3,
        title: "Fixation de l'exercice financier",
        body: "L'exercice financier de la société est fixé conformément aux statuts déposés.",
      },
    ],
    founding_shareholder: [
      {
        number: 1,
        title: 'Ratification du règlement intérieur',
        body: "Le règlement intérieur n° 1 adopté par le conseil d'administration est ratifié.",
      },
      {
        number: 2,
        title: "Élection du conseil d'administration",
        body: "Les administrateurs nommés sont élus jusqu'à la prochaine assemblée annuelle des actionnaires.",
      },
      {
        number: 3,
        title: 'Dispense de vérificateur',
        body: "Conformément à la loi applicable, les actionnaires consentent unanimement à ne pas nommer de vérificateur pour l'exercice en cours.",
      },
    ],
    share_subscription: [
      {
        number: 1,
        title: 'Souscription et émission des actions',
        body: "Le conseil autorise l'émission et la souscription des actions conformément aux résolutions initiales.",
      },
    ],
    annual_board: [
      {
        number: 1,
        title: 'Approbation des états financiers',
        body: "Les états financiers de l'exercice sont approuvés par le conseil d'administration.",
      },
    ],
    annual_shareholder: [
      {
        number: 1,
        title: 'Approbation des états financiers',
        body: "Les états financiers de l'exercice sont approuvés par les actionnaires.",
      },
      {
        number: 2,
        title: 'Dispense de vérificateur',
        body: "Les actionnaires consentent unanimement à ne pas nommer de vérificateur pour l'exercice en cours.",
      },
    ],
    auditor_waiver: [
      {
        number: 1,
        title: 'Dispense de vérificateur',
        body: "Conformément à la loi applicable, les actionnaires consentent unanimement à ne pas nommer de vérificateur.",
      },
    ],
  };

  return map[resolutionType] ?? [{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.' }];
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { companyId, requirementKey } = (await request.json()) as {
      companyId: string;
      requirementKey: string;
    };

    console.log('[generate-item] env check:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    if (!companyId || !requirementKey) {
      return NextResponse.json(
        { success: false, error: 'companyId et requirementKey sont requis.' },
        { status: 400 }
      );
    }

    /* ---------- Vérifier que le type est générable ---------- */

    const docTypeResult = getDocumentType(requirementKey);
    if (!docTypeResult.canGenerate) {
      return NextResponse.json(
        { success: false, canGenerate: false, error: 'Ce document ne peut pas être généré automatiquement.' },
        { status: 400 }
      );
    }

    /* ---------- Client Supabase (service role) ---------- */

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Configuration Supabase manquante.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Charger les données de l'entreprise ---------- */

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, legal_name_fr, neq, incorporation_type')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { success: false, error: 'Entreprise introuvable.' },
        { status: 404 }
      );
    }

    /* --- Administrateurs actifs --- */

    const { data: directorMandates } = await supabase
      .from('director_mandates')
      .select('id, company_people(id, full_name)')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const activeDirectors = (directorMandates ?? []).map((d) => ({
      name: (d.company_people as unknown as { full_name: string }).full_name,
      title: 'Administrateur' as const,
    }));

    /* --- Actionnaires actifs --- */

    const { data: shareholdings } = await supabase
      .from('shareholdings')
      .select('id, quantity, company_people(id, full_name), share_classes(name)')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const activeShareholders = (shareholdings ?? []).map((s) => ({
      name: (s.company_people as unknown as { full_name: string }).full_name,
      shares: s.quantity as number,
      shareClass: (s.share_classes as unknown as { name: string } | null)?.name ?? 'A',
    }));

    /* ---------- Données pour le template ---------- */

    const now = new Date();
    const templateData = {
      companyName: company.legal_name_fr,
      neq: company.neq,
      resolutionDate: now.toISOString().split('T')[0],
      fiscalYear: String(now.getFullYear()),
      language: 'fr' as const,
      framework: company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA',
      directors: activeDirectors,
      shareholders: activeShareholders,
      resolutions: getResolutionsForType(docTypeResult.resolutionType),
    };

    /* ---------- Générer le PDF ---------- */

    // generatePDF est une fonction interne du projet (voir /lib/pdf/generatePDF.ts)
    const { generatePDF } = await import('@/lib/pdf/generatePDF');

    const pdfBuffer = await generatePDF({
      type: docTypeResult.type,
      data: templateData,
    });

    /* ---------- Upload vers Supabase Storage ---------- */

    const sanitizedName = company.legal_name_fr
      .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);

    const fileName = `${requirementKey}_${sanitizedName}_${now.toISOString().split('T')[0]}.pdf`;
    const storagePath = `${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: 'Erreur lors du téléversement du document.' },
        { status: 500 }
      );
    }

    /* ---------- Insérer dans la table documents ---------- */

    const { data: document, error: docInsertError } = await supabase
      .from('documents')
      .insert({
        company_id: companyId,
        document_type: docTypeResult.type,
        title: getResolutionsForType(docTypeResult.resolutionType)[0]?.title ?? requirementKey,
        file_name: fileName,
        storage_path: storagePath,
        status: 'active',
        generated_at: now.toISOString(),
        requirement_key: requirementKey,
      })
      .select('id')
      .single();

    if (docInsertError || !document) {
      console.error('Insert error:', docInsertError);
      return NextResponse.json(
        { success: false, error: "Erreur lors de l'enregistrement du document." },
        { status: 500 }
      );
    }

    /* ---------- Marquer comme complété dans minute_book_requirements ---------- */

    await supabase
      .from('minute_book_requirements')
      .update({
        status: 'completed',
        document_id: document.id,
        completed_at: now.toISOString(),
      })
      .eq('company_id', companyId)
      .eq('requirement_key', requirementKey);

    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName,
    });
  } catch (error) {
    console.error('[generate-item] Full error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
