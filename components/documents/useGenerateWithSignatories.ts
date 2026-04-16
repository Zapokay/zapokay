'use client';
import { useState } from 'react';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

interface GenerateParams {
  companyId: string;
  requirementKey: string;
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
      const res = await fetch('/api/minute-book/generate-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
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
