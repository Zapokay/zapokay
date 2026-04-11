import { getLegalDefinition } from '@/lib/legal-definitions';
import { LegalTooltip } from './LegalTooltip';

interface LegalTermProps {
  termKey: string;
  lang?: 'fr' | 'en';
}

export function LegalTerm({ termKey, lang = 'fr' }: LegalTermProps) {
  const def = getLegalDefinition(termKey);
  if (!def) return null;

  return (
    <LegalTooltip definitionKey={termKey} lang={lang}>
      <span
        style={{
          borderBottom: '1px dashed var(--color-navy-200)',
          cursor: 'help',
        }}
      >
        {lang === 'fr' ? def.term_fr : def.term_en}
      </span>
    </LegalTooltip>
  );
}
