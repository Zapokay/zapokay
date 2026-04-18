import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentsClient } from './DocumentsClient';
import type { VaultDocument } from '@/components/documents/DocumentRow';

export default async function DocumentsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
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
        activeFiscalYears={fiscalYears}
        foundationalRequirementKeys={foundationalRequirementKeys}
      />
    </DashboardShell>
  );
}
