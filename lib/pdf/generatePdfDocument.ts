/**
 * Sprint 9H — Phase 4d Stream 1.
 *
 * Single PDF generation pipeline shared by:
 *   - /api/minute-book/generate-item  (single-row "Générer" from Minute Book)
 *   - /api/wizard/generate            (catch-up wizard, multi-year)
 *
 * Replaces the wizard's prior .txt generation path. Both routes are now thin
 * wrappers that:
 *   1. Authenticate (route layer, not here)
 *   2. Build the call params
 *   3. Call generatePdfDocument(...)
 *
 * Responsibilities of this function:
 *   - Look up the requirement (title, section).
 *   - Load company + current-state directors + current-state shareholders.
 *   - Resolve signatories (caller override wins; else current-state DB).
 *   - Render PDF via the existing lib/pdf/generatePDF adapter.
 *   - Upload to the `documents` bucket using the established naming convention.
 *   - Insert the documents row with the full field set.
 *   - Emit a `document_generated` activity_log event.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { toStorageSafeName } from '@/lib/storage-key';
import { logActivity } from '@/lib/activity-log';
import { generatePDF } from '@/lib/pdf/generatePDF';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

/* ------------------------------------------------------------------ */
/*  Requirement → document type mapping                                */
/* ------------------------------------------------------------------ */

interface DocMapping {
  type: 'board-resolution' | 'shareholder-resolution';
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
  cbca_annual_board_resolution:              { type: 'board-resolution',        resolutionType: 'annual_board' },
  cbca_annual_shareholder_resolution:        { type: 'shareholder-resolution',  resolutionType: 'annual_shareholder' },
  cbca_auditor_waiver:                       { type: 'shareholder-resolution',  resolutionType: 'auditor_waiver' },
};

interface Resolution {
  number: number;
  title: string;
  body: string;
}

function getResolutionsForType(resolutionType: string): Resolution[] {
  const map: Record<string, Resolution[]> = {
    founding_board: [
      { number: 1, title: 'Adoption des statuts',                  body: 'Les statuts de constitution de la société sont pris en note et versés au registre.' },
      { number: 2, title: 'Adoption du règlement intérieur',       body: "Le règlement intérieur n° 1 régissant les affaires internes de la société est adopté et versé au registre." },
      { number: 3, title: "Fixation de l'exercice financier",      body: "L'exercice financier de la société est fixé conformément aux statuts déposés." },
    ],
    founding_shareholder: [
      { number: 1, title: 'Ratification du règlement intérieur',   body: "Le règlement intérieur n° 1 adopté par le conseil d'administration est ratifié." },
      { number: 2, title: "Élection du conseil d'administration",  body: "Les administrateurs nommés sont élus jusqu'à la prochaine assemblée annuelle des actionnaires." },
      { number: 3, title: 'Dispense de vérificateur',              body: "Conformément à la loi applicable, les actionnaires consentent unanimement à ne pas nommer de vérificateur pour l'exercice en cours." },
    ],
    share_subscription: [
      { number: 1, title: 'Souscription et émission des actions',  body: "Le conseil autorise l'émission et la souscription des actions conformément aux résolutions initiales." },
    ],
    annual_board: [
      { number: 1, title: 'Approbation des états financiers',      body: "Les états financiers de l'exercice sont approuvés par le conseil d'administration." },
    ],
    annual_shareholder: [
      { number: 1, title: 'Approbation des états financiers',      body: "Les états financiers de l'exercice sont approuvés par les actionnaires." },
      { number: 2, title: 'Dispense de vérificateur',              body: "Les actionnaires consentent unanimement à ne pas nommer de vérificateur pour l'exercice en cours." },
    ],
    auditor_waiver: [
      { number: 1, title: 'Dispense de vérificateur',              body: "Conformément à la loi applicable, les actionnaires consentent unanimement à ne pas nommer de vérificateur." },
    ],
  };
  return map[resolutionType] ?? [{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.' }];
}

function mapToDocumentType(_type: 'board-resolution' | 'shareholder-resolution'): 'resolution' {
  return 'resolution';
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface GeneratePdfDocumentParams {
  /** Service-role admin client. Required for storage + DB writes that bypass RLS. */
  supabaseAdmin: SupabaseClient;
  /** Authenticated user ID (for activity_log). Required. */
  userId: string;
  companyId: string;
  requirementKey: string;
  /** Fiscal year for annual requirements. Omit for foundational rows. */
  year?: number;
  /** ISO date string (YYYY-MM-DD) to stamp on the document.
   *  Defaults to today if omitted. Callers generating retroactive
   *  documents SHOULD provide an appropriate date (typically the
   *  fiscal-year-end date of the year parameter). */
  resolutionDate?: string;
  /** Optional caller-provided signatory override. When present, replaces the
   *  current-state DB-resolved signature block in the rendered PDF. */
  signatories?: Signatory[];
  /** Document language. Defaults to 'fr'. */
  language?: 'fr' | 'en';
}

export type GeneratePdfDocumentResult =
  | { ok: true; documentId: string; fileName: string; fileUrl: string; title: string }
  | { ok: false; error: string; canGenerate?: false; notFound?: true };

export async function generatePdfDocument(
  params: GeneratePdfDocumentParams,
): Promise<GeneratePdfDocumentResult> {
  const {
    supabaseAdmin,
    userId,
    companyId,
    requirementKey,
    year,
    resolutionDate,
    signatories,
    language = 'fr',
  } = params;

  // 1. Validate requirement is generable.
  const mapping = REQUIREMENT_MAP[requirementKey];
  if (!mapping) {
    return { ok: false, canGenerate: false, error: 'Ce document ne peut pas être généré automatiquement.' };
  }

  // 2. Load requirement metadata (title + minute_book section).
  const { data: requirement } = await supabaseAdmin
    .from('minute_book_requirements')
    .select('title_fr, title_en, section')
    .eq('requirement_key', requirementKey)
    .single();

  // Defensive title fallback: never expose the code identifier in Coffre-fort.
  const requirementTitle = language === 'en' ? requirement?.title_en : requirement?.title_fr;
  const documentTitle =
    requirementTitle && requirementTitle.length > 0
      ? requirementTitle
      : (language === 'en' ? 'Resolution' : 'Résolution');

  // 3. Load company.
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, legal_name_fr, neq, incorporation_type')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    return { ok: false, notFound: true, error: 'Entreprise introuvable.' };
  }

  // 4. Current-state directors (active mandates).
  const { data: directorMandates } = await supabaseAdmin
    .from('director_mandates')
    .select('id, company_people(id, full_name)')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const activeDirectors = (directorMandates ?? []).map((d) => ({
    name: (d.company_people as unknown as { full_name: string }).full_name,
    title: 'Administrateur' as const,
  }));

  // 5. Current-state shareholders.
  const { data: shareholdings } = await supabaseAdmin
    .from('shareholdings')
    .select('id, quantity, company_people(id, full_name), share_classes(name)')
    .eq('company_id', companyId);

  const activeShareholders = (shareholdings ?? []).map((s) => ({
    name: (s.company_people as unknown as { full_name: string }).full_name,
    shares: s.quantity as number,
    shareClass: (s.share_classes as unknown as { name: string } | null)?.name ?? 'A',
  }));

  // 6. Build template payload.
  const now = new Date();
  const hasYear = typeof year === 'number' && Number.isFinite(year);
  const effectiveYear = hasYear ? (year as number) : now.getFullYear();
  const effectiveResolutionDate =
    resolutionDate && /^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)
      ? resolutionDate
      : now.toISOString().split('T')[0];

  const templateData = {
    companyName: company.legal_name_fr,
    neq: company.neq,
    resolutionDate: effectiveResolutionDate,
    fiscalYear: String(effectiveYear),
    language,
    framework: company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA',
    directors: activeDirectors,
    shareholders: activeShareholders,
    resolutions: getResolutionsForType(mapping.resolutionType),
    signatories: signatories && signatories.length > 0 ? signatories : undefined,
  };

  // 7. Render PDF.
  const pdfBuffer = await generatePDF({
    type: mapping.type,
    data: templateData,
  });

  // 8. Upload to storage.
  const sanitizedName = toStorageSafeName(company.legal_name_fr, 60);
  const fileName = `${requirementKey}_${sanitizedName}_${effectiveResolutionDate}.pdf`;
  const storagePath = `${companyId}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[generatePdfDocument] Upload error:', uploadError);
    return { ok: false, error: 'Erreur lors du téléversement du document.' };
  }

  // 9. Insert documents row.
  const { data: document, error: docInsertError } = await supabaseAdmin
    .from('documents')
    .insert({
      company_id:           companyId,
      document_type:        mapToDocumentType(mapping.type),
      title:                documentTitle,
      file_name:            fileName,
      file_url:             storagePath,
      file_size:            pdfBuffer.length,
      language,
      status:               'active',
      source:               'generated',
      framework:            company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA',
      document_year:        effectiveYear,
      requirement_key:      requirementKey,
      ...(hasYear ? { requirement_year: effectiveYear } : {}),
      minute_book_section:  requirement?.section ?? null,
      ...(signatories && signatories.length > 0
        ? { signatories_confirmed: signatories, signature_status: 'pending_signature' }
        : {}),
    })
    .select('id')
    .single();

  if (docInsertError || !document) {
    console.error('[generatePdfDocument] DB insert error:', docInsertError);
    // Rollback orphaned storage object.
    await supabaseAdmin.storage.from('documents').remove([storagePath]);
    return { ok: false, error: "Erreur lors de l'enregistrement du document." };
  }

  // 10. Activity log — same event shape as the wizard emits today.
  await logActivity(
    supabaseAdmin,
    companyId,
    userId,
    'document_generated',
    `Document généré : ${documentTitle}`,
    `Document generated: ${documentTitle}`,
    { document_id: document.id },
  );

  return {
    ok: true,
    documentId: document.id,
    fileName,
    fileUrl: storagePath,
    title: documentTitle,
  };
}
