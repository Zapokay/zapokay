export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  Keys pouvant être générés automatiquement (vraies clés DB)         */
/* ------------------------------------------------------------------ */

const GENERATABLE_KEYS = new Set([
  'lsaq_premiere_resolution_ca',
  'lsaq_premiere_resolution_actionnaires',
  'lsaq_souscription_actions',
  'lsaq_annual_board_resolution',
  'lsaq_annual_shareholder_resolution',
  'lsaq_auditor_waiver',
  'cbca_first_board_resolution',
  'cbca_first_shareholder_resolution',
  'cbca_share_subscription',
]);

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    console.log('[due-diligence/status] env check:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId est requis.' },
        { status: 400 }
      );
    }

    /* ---------- Auth + ownership (closes the trusted-param hole) ----------
       This route reads with the SERVICE ROLE, which bypasses RLS entirely.
       companyId ARRIVES IN THE QUERY STRING and must never be trusted: it
       is validated here against the session user's own companies, via the
       SESSION client (RLS-scoped) plus an explicit user_id match. Placed
       before the service client is built, so an unauthenticated caller
       reaches neither the completeness score nor the missing-document
       list. 401 = no identity. 403 = identity without entitlement. */

    const sessionClient = createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const { data: ownedCompany, error: ownErr } = await sessionClient
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json(
        { error: "Échec de la vérification d'appartenance." },
        { status: 500 }
      );
    }
    if (!ownedCompany) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuration Supabase manquante.' },
        { status: 500 }
      );
    }

    const supabase = createServiceClient();

    /* ---------- Récupérer le framework de l'entreprise ---------- */

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, incorporation_type')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Entreprise introuvable.' },
        { status: 404 }
      );
    }

    const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';

    /* ---------- Charger les exigences (filtrées par framework) ---------- */

    const { data: requirements, error: reqError } = await supabase
      .from('minute_book_requirements')
      .select('id, requirement_key, title_fr, section')
      .or(`framework.eq.${framework},framework.eq.ALL`)
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true });

    if (reqError) {
      console.error('Requirements fetch error:', reqError);
      return NextResponse.json(
        { error: 'Impossible de charger les exigences.' },
        { status: 500 }
      );
    }

    const allRequirements = requirements ?? [];
    const totalRequired = allRequirements.length;

    /* ---------- Les exigences couvertes, LUES SUR LA TABLE DE LIAISON ----------
       A5 — premier lecteur basculé du scalaire `documents.requirement_key` vers
       `requirement_documents`. Un document peut couvrir PLUSIEURS exigences
       depuis A2a ; le scalaire n'en portait que la première, donc un PDF de
       cabinet couvrant cinq exigences n'en satisfaisait visiblement qu'une.

       ⚠️⚠️ LE `!inner` ET LE FILTRE `status` SONT LOAD-BEARING, PAS DÉCORATIFS.
       `requirement_documents` NE PORTE AUCUNE COLONNE D'ÉTAT — délibérément :
       l'état vit sur le DOCUMENT (migration 20260820120000, décision 5). Un
       embed simple `documents(...)` produirait une jointure GAUCHE qui ne filtre
       rien, et les liaisons des documents AU RANCART compteraient comme
       satisfaisantes.

       ★ UNE LIAISON SUR TROIS est portée par un document `superseded` — 30 sur
       92, mesuré sur le parc entier le 2026-08-24. Elles ne changent aucune clé
       AUJOURD'HUI, parce qu'un document actif porte la même clé dans tous les
       cas — ce sont des régénérations successives. Le jour où une exigence sera
       satisfaite UNIQUEMENT par un document retiré, ce filtre sera la seule chose
       entre l'utilisateur et un faux « complété ». */
    const { data: coveredLinks } = await supabase
      .from('requirement_documents')
      .select('requirement_key, document:documents!inner(status)')
      .eq('company_id', companyId)
      .eq('document.status', 'active');

    // `requirement_key` est NOT NULL sur cette table — le `.filter(Boolean)` de
    // l'ancienne version couvrait les documents SANS exigence, qui n'ont
    // simplement pas de ligne ici.
    const completedKeys = new Set(
      (coveredLinks ?? []).map((l) => l.requirement_key)
    );

    /* ---------- Calculer le score ---------- */

    const totalComplete = allRequirements.filter(
      (r) => completedKeys.has(r.requirement_key)
    ).length;

    const completionScore =
      totalRequired > 0 ? Math.round((totalComplete / totalRequired) * 100) : 0;

    /* ---------- Documents manquants ---------- */

    const missingDocuments = allRequirements
      .filter((r) => !completedKeys.has(r.requirement_key))
      .map((r) => ({
        key: r.requirement_key,
        title_fr: r.title_fr,
        section: r.section,
        canGenerate: GENERATABLE_KEYS.has(r.requirement_key),
      }));

    return NextResponse.json({
      completionScore,
      totalRequired,
      totalComplete,
      missingDocuments,
    });
  } catch (error) {
    console.error('[due-diligence/status] Full error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
