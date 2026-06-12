'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import { generateErrorMessageKey } from '@/lib/generate-error-message';

interface GenerateParams {
  companyId: string;
  requirementKey: string;
  /** Fiscal year for annual requirements. Null/undefined for foundational. */
  year?: number | null;
  /** Document language (Two-Layer model). Defaults to 'fr' server-side. */
  language?: 'fr' | 'en';
  signatories?: SignatoryBlock[];
}

interface GenerateResult {
  documentId: string;
  fileName: string;
}

export function useGenerateWithSignatories() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('generate');

  async function generate(params: GenerateParams): Promise<GenerateResult | null> {
    setIsGenerating(true);
    setError(null);
    try {
      // Drop `year` from the wire payload when it's null/undefined — the
      // API treats "no year" as "use current year" (foundational / backward compat).
      const { year, ...rest } = params;
      const payload =
        typeof year === 'number' ? { ...rest, year } : rest;

      const res = await fetch('/api/minute-book/generate-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(t(generateErrorMessageKey(data.error, res.status)));
        return null;
      }
      return { documentId: data.documentId, fileName: data.fileName };
    } catch {
      setError(t('networkError'));
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error };
}
