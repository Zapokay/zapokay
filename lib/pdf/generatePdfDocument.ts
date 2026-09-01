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
import { randomUUID } from 'node:crypto';
import { logActivity } from '@/lib/activity-log';
import { generatePDF } from '@/lib/pdf/generatePDF';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import { fiscalYearForDate } from '@/lib/active-years';
import { pickShareClassName } from '@/lib/pdf/share-class-name';
import { pickCompanyLegalName } from '@/lib/company-name';

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
  title: string;       // FR
  body: string;        // FR
  title_en: string;    // EN
  body_en: string;     // EN
}

// ⚠️ YELLOW — PENDING LAWYER GREEN — DO NOT SHIP UNVALIDATED
// Auditor-waiver canonical clause. Harvey-verdicted 2026-06-17 (LSAQ art.239 / CBCA s.163).
// Founding year-free variant ("premier exercice financier") = YELLOW micro-variant,
// Harvey one-line confirm queued. EN bodies #75 YELLOW.
// Pre-launch grep for "PENDING LAWYER GREEN" must return zero.
function auditorWaiverClauseFor(
  framework: 'CBCA' | 'LSA',
  yearPhraseFr: string,
  yearPhraseEn: string,
): Omit<Resolution, 'number'> {
  if (framework === 'CBCA') {
    return {
      title: 'Dispense de vérificateur',
      body: `Conformément à l'article 163 de la Loi canadienne sur les sociétés par actions (L.R.C. (1985), ch. C-44), la Société n'étant pas une société ayant fait appel au public, tous les actionnaires de la Société, y compris ceux qui ne sont pas par ailleurs fondés à voter, consentent unanimement à ne pas nommer de vérificateur ${yearPhraseFr}. La présente dispense n'a effet que jusqu'à la prochaine assemblée annuelle des actionnaires.`,
      title_en: 'Waiver of Auditor',
      body_en: `In accordance with section 163 of the Canada Business Corporations Act (R.S.C. 1985, c. C-44), the Corporation not being a distributing corporation, all shareholders of the Corporation, including shareholders not otherwise entitled to vote, unanimously consent not to appoint an auditor ${yearPhraseEn}. This waiver is valid only until the next annual meeting of shareholders.`,
    };
  }
  // 'LSA' — non-CBCA catch-all (Loi sur les sociétés par actions du Québec)
  return {
    title: 'Dispense de vérificateur',
    body: `Conformément à l'article 239 de la Loi sur les sociétés par actions (RLRQ, c. S-31.1), la Société n'étant pas un émetteur assujetti, tous les actionnaires de la Société, y compris les détenteurs d'actions ne comportant pas le droit de vote, consentent unanimement à ne pas nommer de vérificateur ${yearPhraseFr}. La présente dispense n'a effet que jusqu'à la prochaine assemblée annuelle des actionnaires.`,
    title_en: 'Waiver of Auditor',
    body_en: `In accordance with section 239 of the Business Corporations Act (CQLR, c. S-31.1), the Corporation not being a reporting issuer, all shareholders of the Corporation, including holders of shares not carrying the right to vote, unanimously consent not to appoint an auditor ${yearPhraseEn}. This waiver is valid only until the next annual meeting of shareholders.`,
  };
}

// Year-naming variant — annual_shareholder + standalone auditor_waiver. HARD GUARD:
// a year-naming waiver must never silently inherit a defaulted year.
function auditorWaiverClause(framework: 'CBCA' | 'LSA', fiscalYear?: string): Omit<Resolution, 'number'> {
  if (!fiscalYear) {
    throw new Error('auditorWaiverClause: fiscalYear required — refusing to default a year-naming waiver');
  }
  return auditorWaiverClauseFor(
    framework,
    `pour l'exercice financier ${fiscalYear}`,
    `for the financial year ${fiscalYear}`,
  );
}

// Year-free founding variant — founding_shareholder item #3 only. Names no specific
// year ("premier exercice financier"); no guard by design.
function auditorWaiverClauseFounding(framework: 'CBCA' | 'LSA'): Omit<Resolution, 'number'> {
  return auditorWaiverClauseFor(framework, 'pour le premier exercice financier', 'for the first financial year');
}

function getResolutionsForType(
  resolutionType: string,
  isBackfill: boolean = false,
  language: 'fr' | 'en' = 'fr',
  framework: 'CBCA' | 'LSA' = 'LSA',
  fiscalYear?: string,
): Resolution[] {
  // #75 EN translations — YELLOW / PENDING LAWYER GREEN (translation inherits FR validation status)
  // #18 Blocker B — LAZY arm construction: build ONLY the requested arm. The
  // auditor-waiver helpers run solely for the arm actually returned, so foundational
  // document types (fiscalYear null) never reach the year-naming guard.
  let base: Resolution[];
  switch (resolutionType) {
    case 'founding_board':
      base = [
        { number: 1, title: 'Adoption des statuts',                  body: 'Les statuts de constitution de la société sont pris en note et versés au registre.', title_en: 'Adoption of Articles', body_en: 'The articles of incorporation of the corporation are noted and entered into the register.' },
        { number: 2, title: 'Adoption du règlement intérieur',       body: "Le règlement intérieur n° 1 régissant les affaires internes de la société est adopté et versé au registre.", title_en: 'Adoption of By-laws', body_en: 'By-law No. 1 governing the internal affairs of the corporation is adopted and entered into the register.' },
        { number: 3, title: "Fixation de l'exercice financier",      body: "L'exercice financier de la société est fixé conformément aux statuts déposés.", title_en: 'Establishment of the Financial Year', body_en: 'The financial year of the corporation is established in accordance with the articles filed.' },
      ];
      break;
    case 'founding_shareholder':
      base = [
        { number: 1, title: 'Ratification du règlement intérieur',   body: "Le règlement intérieur n° 1 adopté par le conseil d'administration est ratifié.", title_en: 'Ratification of By-laws', body_en: 'By-law No. 1 adopted by the board of directors is ratified.' },
        { number: 2, title: "Élection du conseil d'administration",  body: "Les administrateurs nommés sont élus jusqu'à la prochaine assemblée annuelle des actionnaires.", title_en: 'Election of the Board of Directors', body_en: 'The directors named are elected to hold office until the next annual meeting of shareholders.' },
        { number: 3, ...auditorWaiverClauseFounding(framework) },
      ];
      break;
    case 'share_subscription':
      base = [
        { number: 1, title: 'Souscription et émission des actions',  body: "Le conseil autorise l'émission et la souscription des actions conformément aux résolutions initiales.", title_en: 'Subscription and Issuance of Shares', body_en: 'The board authorizes the issuance and subscription of shares in accordance with the initial resolutions.' },
      ];
      break;
    case 'annual_board':
      base = [
        { number: 1, title: 'Approbation des états financiers',      body: "Les états financiers de l'exercice sont approuvés par le conseil d'administration.", title_en: 'Approval of Financial Statements', body_en: 'The financial statements for the financial year are approved by the board of directors.' },
      ];
      break;
    case 'annual_shareholder':
      base = [
        { number: 1, title: 'Approbation des états financiers',      body: "Les états financiers de l'exercice sont approuvés par les actionnaires.", title_en: 'Approval of Financial Statements', body_en: 'The financial statements for the financial year are approved by the shareholders.' },
        { number: 2, ...auditorWaiverClause(framework, fiscalYear) },
      ];
      break;
    case 'auditor_waiver':
      base = [
        { number: 1, ...auditorWaiverClause(framework, fiscalYear) },
      ];
      break;
    default:
      base = [{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.', title_en: 'Resolution', body_en: 'The resolution is adopted.' }];
  }
  // #75: resolve title/body by document language so the shells render the right
  // locale (shells read .title/.body verbatim — no shell change needed).
  const resolved = base.map((r) => ({
    ...r,
    title: language === 'en' ? r.title_en : r.title,
    body: language === 'en' ? r.body_en : r.body,
  }));
  // #175: confirmatory back-fill branch scaffold. Both arms return the EXISTING
  // bodies for now — wording is a separate build. Wired only to prove the seam;
  // the rendered document is identical to today regardless of isBackfill.
  if (isBackfill) {
    return resolved;
  }
  return resolved;
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
  signatories?: SignatoryBlock[];
  /** Document language. Defaults to 'fr'. */
  language?: 'fr' | 'en';
}

export type GeneratePdfDocumentResult =
  | { ok: true; documentId: string; fileName: string; fileUrl: string; title: string }
  | { ok: false; error: string; canGenerate?: false; notFound?: true };

// A7-3 — forme embarquée du candidat au rancart. Les tables embarquées de
// PostgREST se typent en TABLEAU faute de cardinalité connue sans types générés :
// le type dit un tableau, le runtime rend un objet. Idiome maison, même
// commentaire qu'event-completeness.ts:230 et requirement-completeness.ts:291.
interface RawSupersedeCandidate {
  document_id: string;
  document: {
    id: string;
    status: string;
    is_finalized: boolean;
    signature_status: string | null;
  } | null;
}

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
    .select('title_fr, title_en, section, category')
    .eq('requirement_key', requirementKey)
    .single();

  const isFoundational = requirement?.category === 'foundational';

  // Defensive title fallback: never expose the code identifier in Coffre-fort.
  const requirementTitle = language === 'en' ? requirement?.title_en : requirement?.title_fr;
  const documentTitle =
    requirementTitle && requirementTitle.length > 0
      ? requirementTitle
      : (language === 'en' ? 'Resolution' : 'Résolution');

  // 3. Load company.
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, legal_name_fr, legal_name_en, neq, incorporation_type, fiscal_year_end_month, fiscal_year_end_day')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    return { ok: false, notFound: true, error: 'Entreprise introuvable.' };
  }

  // ⚠️ REPLI DANS LES DEUX SENS. Ce site faisait `: fr` nu, sûr tant que
  // legal_name_fr était NOT NULL — il ne l'est plus depuis 50b9d62.
  const companyName = pickCompanyLegalName(company, language);
  if (!companyName) {
    return { ok: false, error: 'Entreprise sans dénomination.' };
  }

  // 4. Current-state directors (active mandates).
  const { data: directorMandates } = await supabaseAdmin
    .from('director_mandates')
    .select('id, appointment_date, company_people(id, full_name)')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const activeDirectors = (directorMandates ?? []).map((d) => ({
    name: (d.company_people as unknown as { full_name: string }).full_name,
    title: 'Administrateur' as const,
  }));

  // 5. Current-state shareholders.
  // Atom 2: holders moved to shareholding_holders join table. Single-holder
  // individual rows resolve via holders[0].person; entity holders surface the
  // entity legal_name. Full atom 4 PDF branching (per-trustee Par: lines for
  // trusts, single Par: for corps, joint inline) is Phase 10A.5 atom 4 scope.
  const { data: shareholdings } = await supabaseAdmin
    .from('shareholdings')
    .select(`
      id, quantity,
      shareholding_holders(holder_type, person_id, entity_id, display_order,
        person:company_people(id, full_name),
        entity:shareholder_entities(id, legal_name, entity_type)
      ),
      share_classes(name, name_en)
    `)
    .eq('company_id', companyId)
    .is('end_date', null);

  const activeShareholders = (shareholdings ?? []).map((s) => {
    const holders = (s.shareholding_holders ?? []) as unknown as Array<{
      person: { full_name: string } | null;
      entity: { legal_name: string } | null;
    }>;
    const shareholderName =
      holders[0]?.person?.full_name ??
      holders[0]?.entity?.legal_name ??
      '(unknown holder)';
    return {
      name: shareholderName,
      shares: s.quantity as number,
      shareClass: pickShareClassName(s.share_classes, language),
    };
  });

  // 6. Build template payload.
  const now = new Date();
  const hasYear = typeof year === 'number' && Number.isFinite(year);
  const effectiveYear = hasYear ? (year as number) : now.getFullYear();
  const effectiveResolutionDate =
    resolutionDate && /^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)
      ? resolutionDate
      : now.toISOString().split('T')[0];

  // 6b. #175 confirmatory back-fill DETECTION (detection only — wording is a
  // separate build; the rendered output below is unchanged regardless of the
  // result). A resolution is a confirmatory back-fill when the CURRENT board
  // postdates the resolution's target fiscal year: i.e. ANY active director was
  // appointed in a fiscal year strictly AFTER effectiveYear
  // (max(appointmentFY) > effectiveYear is the locked trigger).
  const fyEndMonth = (company as { fiscal_year_end_month: number | null }).fiscal_year_end_month;
  const fyEndDay = (company as { fiscal_year_end_day: number | null }).fiscal_year_end_day;
  const appointmentFYs: number[] = [];
  let isBackfill = false;
  if (fyEndMonth == null || fyEndDay == null) {
    // Strict: never default to Dec-31 (mirrors generate-lifecycle-document's
    // error-if-missing posture). Onboarding forces FYE, so this only fires for
    // legacy/fixture/import rows — surface it rather than silently mis-frame.
    console.warn(`[#175 backfill-detection] company=${companyId} missing fiscal_year_end_month/day — isBackfill forced false`);
  } else {
    for (const d of directorMandates ?? []) {
      const appt = (d as { appointment_date: string | null }).appointment_date;
      if (!appt) {
        console.warn(`[#175 backfill-detection] director mandate ${(d as { id: string }).id} has null appointment_date — skipped from trigger`);
        continue;
      }
      const apptFY = fiscalYearForDate(appt, fyEndMonth, fyEndDay);
      appointmentFYs.push(apptFY);
      if (apptFY > effectiveYear) isBackfill = true;
    }
  }
  console.log(`[#175 backfill-detection] company=${companyId} type=${mapping.resolutionType} targetYear=${effectiveYear} appointmentFYs=${JSON.stringify(appointmentFYs)} isBackfill=${isBackfill}`);

  const frameworkValue: 'CBCA' | 'LSA' = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
  const fiscalYearValue: string | undefined = isFoundational ? undefined : String(effectiveYear);

  const templateData = {
    companyName,
    neq: company.neq,
    documentTitle,
    resolutionDate: effectiveResolutionDate,
    fiscalYear: fiscalYearValue ?? null,
    language,
    framework: frameworkValue,
    directors: activeDirectors,
    shareholders: activeShareholders,
    resolutions: getResolutionsForType(mapping.resolutionType, isBackfill, language, frameworkValue, fiscalYearValue),
    signatories: signatories && signatories.length > 0 ? signatories : undefined,
  };

  // 7. Mint the durable documents.id BEFORE render (#172): the same UUID is
  // persisted as documents.id below, so the value stamped into the footer ==
  // the stored row id. The mint has no dependency on the rendered buffer.
  const documentId = randomUUID();
  const fileName = `${documentId}.pdf`;
  const storagePath = `${companyId}/${fileName}`;

  // 8. Render PDF.
  const pdfBuffer = await generatePDF({
    type: mapping.type,
    data: { ...templateData, documentId },
  });

  // 9. Upload to storage.
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

  // A7-3 — LE DERNIER LECTEUR DU SCALAIRE, ET LE SEUL QUI DÉTRUIT.
  // #135 mise au rancart des brouillons, lue désormais sur requirement_documents.
  //
  // ⚠ RÈGLE PRODUIT : UN DOCUMENT QUI COUVRE PLUSIEURS EXIGENCES N'EST LE
  // BROUILLON D'AUCUNE. A2a a rendu possible qu'un document porte N exigences ;
  // le mettre au rancart pour une seule ferait disparaître la couverture des
  // N-1 autres, que personne n'a demandé à perdre. Depuis A7-2 cette perte est
  // VISIBLE dans Complétude. La garde « exactement une liaison » rend donc ce
  // prédicat STRICTEMENT PLUS ÉTROIT que le scalaire qu'il remplace : il ne
  // peut que gracier, jamais élargir. Mesuré sur le parc le 2026-08-25 : un
  // seul document change de sort, « blalboo » (Acme Test inc., 2 liaisons).
  //
  // ⚠ D6 : toute lecture de requirement_documents JOINT `documents` et filtre
  // status='active'. La table n'a pas de colonne d'état, délibérément.
  //
  // Portée inchangée par ailleurs : société, exigence, année (branche identique
  // à celle de l'insert), actif, non finalisé, non signé. Les rangées signées
  // ou finalisées ne sont JAMAIS touchées ; le remplacement délibéré est un
  // autre chemin, confirmé par l'utilisateur.
  {
    // 1. Les candidats : les documents LIÉS à cette exigence + cette année.
    //    ⚠ UNE SEULE CHAÎNE LITTÉRALE, PAS UNE CONCATÉNATION (§221) : un `+`
    //    rend la chaîne non littérale, l'analyseur de types de supabase-js
    //    abandonne et rend GenericStringError sur chaque colonne demandée.
    let candidateQuery = supabaseAdmin
      .from('requirement_documents')
      .select('document_id, document:documents!inner(id, status, is_finalized, signature_status)')
      .eq('company_id', companyId)
      .eq('requirement_key', requirementKey)
      .eq('document.status', 'active');
    candidateQuery = (hasYear && !isFoundational)
      ? candidateQuery.eq('requirement_year', effectiveYear)
      : candidateQuery.is('requirement_year', null);

    const { data: rawCandidates, error: candidateError } = await candidateQuery;

    if (candidateError) {
      // Non fatal : ne jamais bloquer la génération sur un échec de rancart.
      console.error('[#135/A7-3] lecture des candidats échouée (non fatal):', candidateError);
    } else {
      const candidates = (rawCandidates ?? []) as unknown as RawSupersedeCandidate[];

      // 2. Les gardes restantes, appliquées ici plutôt qu'en requête : sur un
      //    chemin destructif, une condition qu'on peut lire dans le fichier
      //    vaut mieux qu'une condition enfouie dans une chaîne PostgREST.
      // ⚠️ `Array.from(new Set(…))` et NON `[...new Set(…)]` : tsconfig.json ne
      // déclare aucun `target`, donc ES5, où le spread d'un Set lève TS2802.
      // Idiome du dépôt — active-years.ts:145, resolve-signatory-blocks.ts:89.
      const eligibleIds = Array.from(new Set(
        candidates
          .filter((c) =>
            c.document !== null &&
            c.document.is_finalized === false &&
            ['draft', 'pending_signature'].includes(c.document.signature_status ?? ''),
          )
          .map((c) => c.document_id),
      ));

      if (eligibleIds.length > 0) {
        // 3. LA GARDE DU LOT : compter TOUTES les liaisons de ces documents,
        //    pas seulement celles de l'exigence courante. Un document à deux
        //    liaisons ou plus est un recueil, pas un brouillon.
        const { data: allLinks, error: linkCountError } = await supabaseAdmin
          .from('requirement_documents')
          .select('document_id')
          .in('document_id', eligibleIds);

        if (linkCountError) {
          console.error('[#135/A7-3] comptage des liaisons échoué (non fatal) — aucun rancart appliqué:', linkCountError);
        } else {
          const linkCount = new Map<string, number>();
          for (const l of allLinks ?? []) {
            linkCount.set(l.document_id, (linkCount.get(l.document_id) ?? 0) + 1);
          }
          // Exactement une. Zéro liaison (dérive) épargne aussi : la direction
          // de l'erreur reste conservatrice.
          const evictableIds = eligibleIds.filter((id) => linkCount.get(id) === 1);

          if (evictableIds.length > 0) {
            const { error: supersedeError } = await supabaseAdmin
              .from('documents')
              .update({ status: 'superseded', superseded_at: new Date().toISOString() })
              .in('id', evictableIds)
              // Gardes RÉAFFIRMÉES sur l'écriture : entre la lecture et
              // l'update, une rangée a pu être signée ou finalisée. Sur un
              // chemin destructif, on ne fait pas confiance à une lecture.
              .eq('company_id', companyId)
              .eq('status', 'active')
              .eq('is_finalized', false)
              .in('signature_status', ['draft', 'pending_signature']);

            if (supersedeError) {
              console.error('[#135/A7-3] mise au rancart échouée (non fatal):', supersedeError);
            }
          }
        }
      }
    }
  }

  // A4-bis — UNE SEULE SOURCE POUR L'ANNÉE DE L'EXIGENCE.
  // Le scalaire et la liaison DOIVENT porter la même valeur : l'invariant
  // « année NULLE = la ligne du catalogue est fondationnelle » (A4, D2) se
  // vérifie sur les deux. `effectiveYear` retombe sur l'année courante quand
  // `year` est absent — l'écrire nu sur un fondationnel poserait 2026 sur une
  // ligne qui doit porter NULL.
  const requirementLinkYear = hasYear && !isFoundational ? effectiveYear : null;

  // 10. Insert documents row.
  const { data: document, error: docInsertError } = await supabaseAdmin
    .from('documents')
    .insert({
      id:                   documentId,
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
      document_year:        isFoundational ? null : effectiveYear,
      // A8-1 — le scalaire n'est plus écrit. La couverture vit
      // exclusivement dans `requirement_documents`, insérée plus bas.
      // `documents.requirement_key` n'a plus aucun lecteur depuis
      // `e3e7617` et n'a plus aucun écrivain depuis ce lot.
      // ⚠️ Ne pas la ressusciter : « la première exigence » n'a jamais
      // été une désignation de l'utilisateur, seulement l'ordre dans
      // lequel le catalogue est émis (E1).
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

  // ── A4-bis — LA LIAISON. ──────────────────────────────────────────────
  // Sans ce bloc, chaque document généré naît avec un scalaire et SANS
  // liaison, et la reprise historique (A4, `83153c1`) se périme un document
  // à la fois. C'est le chemin qui avait produit 57 des 81 documents repris.
  //
  // ★ UNE SEULE LIAISON, et c'est structurel : une génération répond à UNE
  // exigence. `requirementKey` est `string` non optionnel, et REQUIREMENT_MAP
  // ferme la porte avant tout effet de bord — aucun document inséré ici ne
  // peut porter une clé nulle.
  //
  // ⚠️ `origin: 'generated'` EXPLICITEMENT. Le DEFAULT de la colonne est
  // 'declared' : l'omettre n'écrirait pas une valeur « non vérifiée », elle
  // écrirait une valeur FAUSSE — « l'utilisateur a coché cette exigence à
  // l'import » sur un document que personne n'a téléversé.
  const { error: reqLinkError } = await supabaseAdmin
    .from('requirement_documents')
    .insert({
      document_id:      document.id,
      company_id:       companyId,
      requirement_key:  requirementKey,
      requirement_year: requirementLinkYear,
      origin:           'generated',
    });

  if (reqLinkError) {
    // ★ ON NE DÉFAIT PAS LE DOCUMENT, ET C'EST UNE DÉCISION, PAS UN OUBLI.
    // Le chemin d'import (upload-document.ts, bloc 4c) supprime le document
    // quand sa liaison échoue — là-bas, la liaison EST la demande de
    // l'utilisateur, qui a coché des cases. Ici sa demande est le PDF.
    // ⚠️ ET SURTOUT : l'éviction #135 s'exécute AVANT cet insert. Détruire le
    // document laisserait l'utilisateur avec son ancien document AU RANCART
    // et aucun nouveau — le pire des trois états, atteignable uniquement par
    // la politique destructive.
    // Le trou est réparable : un rejeu de la migration A4 le comble
    // (ON CONFLICT DO NOTHING), et son bloc `still_unlinked` le DÉTECTE.
    console.error(
      '[generatePdfDocument] requirement_documents insert failed — document kept, link missing. ' +
      'Repair: replay migration 20260824120000, or insert manually.',
      { documentId: document.id, requirementKey, requirementYear: requirementLinkYear, error: reqLinkError },
    );
  }

  // 10. Activity log — same event shape as the wizard emits today.
  const fySuffixFr = !isFoundational && effectiveYear ? ` — Exercice ${effectiveYear}` : '';
  const fySuffixEn = !isFoundational && effectiveYear ? ` — Fiscal Year ${effectiveYear}` : '';
  await logActivity(
    supabaseAdmin,
    companyId,
    userId,
    'document_generated',
    `Document généré : ${documentTitle}${fySuffixFr}`,
    `Document generated: ${documentTitle}${fySuffixEn}`,
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
