export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentsClient } from '@/app/[locale]/dashboard/minute-book/documents/DocumentsClient';
import type { VaultDocument } from '@/components/documents/DocumentRow';
import { computeFiscalYearRange } from '@/lib/active-years';

export default async function DocumentsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const supabase = createClient();

  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', company?.id ?? '')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  /* ---------- Les exigences couvertes, par document ----------
     A6 — le Coffre lit `requirement_documents`. Un document peut en couvrir
     plusieurs depuis A2a ; le scalaire n'en portait que la première.
     ⚠️ Le `!inner` + `status='active'` est l'invariant D6 : la table de liaison
     ne porte AUCUNE colonne d'état, l'état vit sur le DOCUMENT. On le respecte
     ici même si la carte n'est consultée que pour des documents déjà actifs —
     une exception « inoffensive » devient le précédent de la suivante. */
  const { data: requirementLinks } = await supabase
    .from('requirement_documents')
    .select('document_id, requirement_key, requirement_year, document:documents!inner(status)')
    .eq('company_id', company?.id ?? '')
    .eq('document.status', 'active');

  // ⚠️ UN OBJET SIMPLE, PAS UNE `Map`. Cette valeur traverse la frontière
  // serveur → client : une Map n'est pas sérialisable dans une charge RSC et
  // arriverait vide, sans erreur. Un objet `{ key, year }` reste du JSON pur.
  const requirementKeysByDocument: Record<string, { key: string; year: number | null }[]> = {};
  for (const link of requirementLinks ?? []) {
    (requirementKeysByDocument[link.document_id] ??= []).push({
      key: link.requirement_key,
      year: link.requirement_year ?? null,
    });
  }

  const { data: fiscalYearsData } = company
    ? await supabase
        .from('company_fiscal_years')
        .select('year')
        .eq('company_id', company.id)
        .eq('status', 'active')
        .order('year', { ascending: false })
    : { data: [] };
  const fiscalYears = (fiscalYearsData ?? []).map((fy: { year: number }) => fy.year);

  // Vault upload year picker: incorporation FY -> current FY (UNCAPPED), so
  // out-of-window archive years are selectable (classified as hold on upload).
  // Modal-only; the banner + fiscalYearsConfigured stay on the active set.
  const vaultYearRange = company
    ? computeFiscalYearRange(
        (company.incorporation_date as string | null) ?? null,
        (company.fiscal_year_end_month as number | null) ?? 12,
        (company.fiscal_year_end_day as number | null) ?? 31,
      ).reverse()
    : [];

  // The requirement catalog for this company's framework — titles included.
  // Mirrors the framework filter used in /api/minute-book/completeness.
  const framework = company?.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
  // ⚠️ Le filtre `framework` ne sert pas la puce, il sert la justesse : sans lui,
  // un client LSA verrait les libellés `cbca_*`.
  const { data: catalogRows } = company
    ? await supabase
        .from('minute_book_requirements')
        .select('requirement_key, category, title_fr, title_en')
        .or(`framework.eq.${framework},framework.eq.ALL`)
    : { data: [] };
  const catalog = (catalogRows ?? []) as {
    requirement_key: string; category: string; title_fr: string; title_en: string;
  }[];

  // ⚠️ `category` n'est plus un filtre SQL, il est reconstruit ICI. Sans ce filtre,
  // la puce « Documents fondateurs » cesserait de filtrer SANS PLANTER.
  const foundationalRequirementKeys = catalog
    .filter((r) => r.category === 'foundational')
    .map((r) => r.requirement_key);

  // ⚠️ UNIQUE (requirement_key, framework), PAS UNIQUE (requirement_key) : le jour
  // où une clé existe sous ('foo','ALL') ET ('foo','LSA'), on le dit, on n'écrase pas.
  const requirementTitles: Record<string, { fr: string; en: string }> = {};
  for (const r of catalog) {
    if (r.requirement_key in requirementTitles) {
      console.warn(
        `[coffre] Catalogue ambigu pour le régime ${framework} : la clé "${r.requirement_key}" ` +
        `apparaît plus d'une fois. Le premier libellé lu est conservé. À corriger au catalogue.`
      );
      continue;
    }
    requirementTitles[r.requirement_key] = { fr: r.title_fr, en: r.title_en };
  }

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      fiscalYears={fiscalYears}
      yearPickerIncludeFoundational={true}
      yearPickerIncludeUnclassified={true}
    >
      <DocumentsClient
        locale={locale}
        company={company}
        initialDocuments={(documents ?? []) as VaultDocument[]}
        requirementKeysByDocument={requirementKeysByDocument}
        requirementTitles={requirementTitles}
        fiscalYearsConfigured={fiscalYears.length > 0}
        activeFiscalYears={vaultYearRange}
        // activeFiscalYears now carries the FULL incorporation->current range
        // (vault offers archive years); the prop rename is a Tier-4 follow-up.
        foundationalRequirementKeys={foundationalRequirementKeys}
        preferredLanguage={(profile?.preferred_language as 'fr' | 'en') ?? 'fr'}
      />
    </DashboardShell>
  );
}
