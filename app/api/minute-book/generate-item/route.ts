export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELLE FABRIQUE UN PDF, DONC ELLE VOYAGE AVEC LE NAVIGATEUR — lot ALLÈGE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CETTE LIGNE PORTE DEUX CHOSES, ET LA SECONDE EST INVISIBLE.
 *
 *  1. Ce qu'elle dit : fabriquer un PDF prend du temps. Le défaut de Vercel
 *     est court pour une génération à froid, mesurée à 7,2 s.
 *
 *  2. ★ Ce qu'elle FAIT EN PLUS, et qui est le lot : elle SÉPARE cette route
 *     des autres. Vercel regroupe les routes en une seule fonction, et la
 *     fonction emporte l'UNION de ce que son groupe trace. Trente-neuf routes
 *     partageaient une lambda de 73 Mo dont 65,2 Mo de navigateur — y compris
 *     `completeness`, `activity-log` ou `check-identifier`, qui n'ouvrent
 *     jamais de navigateur. Une route dont la CONFIGURATION diffère ne peut
 *     pas être regroupée avec les autres : c'est le levier, et il est mesuré —
 *     31 routes ordinaires sont passées de 73 Mo à 2,6 Mo.
 *
 * ⛔ NE PAS RETIRER CETTE LIGNE EN LA CROYANT DÉCORATIVE. La retirer remet
 *    cette route dans le groupe ordinaire, et remet 65 Mo de navigateur dans
 *    les trente et une autres. Le réveil à froid de TOUT le produit en dépend.
 * ⛔ ET NE PAS L'AJOUTER À UNE ROUTE QUI NE FABRIQUE PAS DE PDF : elle la
 *    ferait entrer dans le groupe lourd, ce qui est exactement l'inverse.
 * ⚪ `check:inscription` tient les deux sens de cette règle.
 */
export const maxDuration = 60;


import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { generatePdfDocument } from '@/lib/pdf/generatePdfDocument';
import { exercicesDeLaSociete } from '@/lib/active-years';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';

export async function POST(request: NextRequest) {
  try {
    const { companyId, requirementKey, signatories, year, language } =
      (await request.json()) as {
        companyId: string;
        requirementKey: string;
        signatories?: SignatoryBlock[];
        /** Optional — fiscal year for annual requirements. Omitted for foundational. */
        year?: number;
        /** Optional — document language (Two-Layer model). Defaults to 'fr'. */
        language?: 'fr' | 'en';
      };

    if (!companyId || !requirementKey) {
      return NextResponse.json(
        { success: false, error: 'MISSING_PARAMS' },
        { status: 400 },
      );
    }

    /* ---------- Auth (Sprint 9H Phase 4d Stream 1 — newly enforced) ---------- */

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    /* ---------- Ownership check (closes the trusted-param hole) ----------
       userId is SESSION-derived (user.id), NEVER read from the body.
       companyId ARRIVES IN THE BODY and must never be trusted: it is
       validated here against the session user's own companies, via the
       SESSION client (RLS-scoped) plus an explicit user_id match. This
       runs BEFORE the service-role client is built, so no generation and
       no write can happen for a company the caller does not own.
       401 = no identity. 403 = identity without entitlement. */

    const { data: ownedCompany, error: ownErr } = await supabase
      .from('companies')
      .select('id, incorporation_date, fiscal_year_end_month, fiscal_year_end_day')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json(
        { success: false, error: 'OWNERSHIP_CHECK_FAILED' },
        { status: 500 },
      );
    }
    if (!ownedCompany) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    /* ---------- L'exercice appartient à la société ----------
       `year` arrive du corps : il doit figurer dans la déclaration de la société
       (lib/active-years.ts), du premier exercice à celui en cours. Les appelants du
       navigateur passent l'année d'une ligne que la déclaration a produite ; cette
       garde ferme la requête directe et la page restée ouverte.
       ⚠️ ELLE NE COUVRE PAS L'ANNÉE ABSENTE. Sans `year`, generatePdfDocument retombe
       sur l'année CIVILE du serveur et l'écrit dans `document_year` si l'exigence est
       annuelle. Les appelants du navigateur ne l'omettent que pour une exigence
       fondatrice ; une requête directe peut l'omettre pour une annuelle. Le fermer
       demande de refuser une exigence annuelle sans année : un geste de plus.
       ⛔ ET CE N'EST PAS LA CLÔTURE. Savoir s'il est trop tôt pour générer relève de
       `mustBlockGeneration`, qu'aucune route API n'importe. */
    if (year !== undefined && year !== null) {
      const { exercices } = exercicesDeLaSociete(ownedCompany);
      if (typeof year !== 'number' || !exercices.includes(year)) {
        return NextResponse.json(
          { success: false, error: 'FISCAL_YEAR_NOT_DECLARED' },
          { status: 400 },
        );
      }
    }

    /* ---------- Service-role admin client for storage + DB writes ---------- */

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'SERVER_MISCONFIGURED' },
        { status: 500 },
      );
    }
    const supabaseAdmin = createServiceClient();

    /* ---------- Delegate to the unified generation pipeline ---------- */

    const result = await generatePdfDocument({
      supabaseAdmin,
      userId: user.id,
      companyId,
      requirementKey,
      year,
      signatories,
      language,
    });

    if (!result.ok) {
      if (result.canGenerate === false) {
        return NextResponse.json(
          { success: false, canGenerate: false, error: 'CANNOT_GENERATE' },
          { status: 400 },
        );
      }
      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: 'COMPANY_NOT_FOUND' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'GENERATION_FAILED' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
    });
  } catch (error) {
    console.error('[generate-item] Full error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
