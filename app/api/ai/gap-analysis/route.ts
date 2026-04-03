import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface GapYear {
  year: number;
  fiscalYear: string;
  missingDocuments: string[];
  status: 'missing' | 'partial' | 'complete';
}

const REQUIRED_DOCS: Record<string, string[]> = {
  LSA: ['resolution', 'pv', 'rapport'],
  CBCA: ['resolution', 'pv', 'rapport', 'statuts'],
};

function getFiscalYears(
  incorporationDate: string,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number
): number[] {
  const start = new Date(incorporationDate);
  const today = new Date();
  const years: number[] = [];

  let year = start.getFullYear();
  while (year <= today.getFullYear()) {
    years.push(year);
    year++;
  }
  return years;
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, locale } = await req.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const supabase = createClient();

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('incorporation_date, fiscal_year_end_month, fiscal_year_end_day, incorporation_type')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const incDate = company.incorporation_date ?? new Date().toISOString().slice(0, 10);
    const fyMonth = company.fiscal_year_end_month ?? 12;
    const fyDay = company.fiscal_year_end_day ?? 31;
    const incType = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
    const requiredDocs = REQUIRED_DOCS[incType] ?? REQUIRED_DOCS['LSA'];

    const years = getFiscalYears(incDate, fyMonth, fyDay);

    const { data: documents } = await supabase
      .from('documents')
      .select('document_type, document_year')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const docsByYear: Record<number, Set<string>> = {};
    for (const doc of documents ?? []) {
      if (doc.document_year) {
        if (!docsByYear[doc.document_year]) docsByYear[doc.document_year] = new Set();
        docsByYear[doc.document_year].add(doc.document_type);
      }
    }

    const gaps: GapYear[] = years.map(year => {
      const present = docsByYear[year] ?? new Set();
      const missing = requiredDocs.filter(d => !present.has(d));

      let status: GapYear['status'];
      if (missing.length === 0) status = 'complete';
      else if (missing.length < requiredDocs.length) status = 'partial';
      else status = 'missing';

      return {
        year,
        fiscalYear: `${year}–${year + 1}`,
        missingDocuments: missing,
        status,
      };
    });

    const hasGaps = gaps.some(g => g.status !== 'complete');

    // Call Claude API for summary
    let summary = '';
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `Tu es l'assistant de conformité de ZapOkay. Tu analyses les lacunes dans les registres corporatifs de PME québécoises. Tu réponds en ${locale === 'fr' ? 'français' : 'anglais'}. Tu utilises un langage simple et encourageant. Tu ne donnes JAMAIS de conseils juridiques. Termine par : "${locale === 'fr' ? 'Ces informations sont fournies à titre indicatif et ne constituent pas un avis juridique.' : 'This information is provided for reference only and does not constitute legal advice.'}"`,
          messages: [{
            role: 'user',
            content: `Lacunes détectées :\n${JSON.stringify(gaps, null, 2)}\n\nGénère un résumé en 3-4 phrases qui :\n1. Identifie les années problématiques\n2. Explique simplement ce qui manque\n3. Rassure que c'est corrigeable\n4. Suggère de passer à l'action`,
          }],
        }),
      });

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        summary = claudeData.content?.[0]?.text ?? '';
      }
    } catch {
      // Claude unavailable — return gaps without summary
    }

    return NextResponse.json({ gaps, summary, hasGaps });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
