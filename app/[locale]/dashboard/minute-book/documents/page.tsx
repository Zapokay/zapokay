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

  // Foundational requirement keys for this company's framework.
  // Mirrors the framework filter used in /api/minute-book/completeness.
  const framework = company?.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
  const { data: foundationalReqs } = company
    ? await supabase
        .from('minute_book_requirements')
        .select('requirement_key')
        .eq('category', 'foundational')
        .or(`framework.eq.${framework},framework.eq.ALL`)
    : { data: [] };
  const foundationalRequirementKeys = (foundationalReqs ?? []).map(
    (r: { requirement_key: string }) => r.requirement_key
  );

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
