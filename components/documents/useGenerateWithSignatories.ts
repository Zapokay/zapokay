'use client';
import { useState } from 'react';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

interface GenerateParams {
  companyId: string;
  requirementKey: string;
  /** Fiscal year for annual requirements. Null/undefined for foundational. */
  year?: number | null;
  signatories?: Signatory[];
}

interface GenerateResult {
  documentId: string;
  fileName: string;
}

export function useGenerateWithSignatories() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(data.error ?? 'Erreur lors de la génération.');
        return null;
      }
      return { documentId: data.documentId, fileName: data.fileName };
    } catch {
      setError('Erreur réseau.');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error };
}
