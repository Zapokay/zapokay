'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Eye, Upload } from 'lucide-react';
import type { VaultDocument } from '@/components/documents/DocumentRow';
import { getDocumentState } from '@/lib/minute-book/state';
import { displayStateOf, displayStateLabelKey } from '@/lib/minute-book/display-state';
import { typeAffiche } from '@/lib/requirement-doctype';
import ListRow from './ListRow';
import { IdentityBox, codeDeLangue } from './state-visuals';

interface ArchiveDocRowProps {
  doc: VaultDocument;
  /**
   * Mirrors RequirementRow's own-the-file-input pattern: this row picks the
   * PDF and hands (doc, file) up; the parent (CompletenessPage) owns the
   * doc-id-based replace upload (replaceDocumentId = doc.id, docYear = the
   * hold year). Distinct from RequirementRow.onFileSelected only in that the
   * archive doc has no requirement_key, so we pass the doc itself.
   */
  onReplace: (doc: VaultDocument, file: File) => void | Promise<void>;
}

export default function ArchiveDocRow({ doc, onReplace }: ArchiveDocRowProps) {
  const tDocs = useTranslations('documents');
  const tState = useTranslations('documentState');
  const [isReplacing, setIsReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleView() {
    window.open(
      `/api/documents/${doc.id}/download?preview=true`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset so the SAME file can be re-picked after an error (browsers suppress
    // onChange for identical filenames otherwise) — matches RequirementRow.
    e.target.value = '';
    if (!f) return;
    setIsReplacing(true);
    try {
      await onReplace(doc, f);
    } finally {
      setIsReplacing(false);
    }
  }

  // Certification-aware chip: signed final vs plain archive. null / false /
  // undefined all fall to the plain "Archive" label via the === true guard.
  const isSigned = doc.is_finalized === true;
  // V1 — l'archive l'emporte sur l'état du document ; la certification ne nuance que le libellé.
  const displayState = displayStateOf({
    documentState: getDocumentState({
      satisfied: true,
      source: doc.source === 'generated' || doc.source === 'uploaded' ? doc.source : null,
      is_finalized: doc.is_finalized,
    }),
    isArchived: true,
  });

  const buttonClass =
    'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  const oeil = 'flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[var(--nontext-muted)] hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] transition-colors';
  const couleurArchive = isSigned ? 'var(--row-state-archive-certified)' : 'var(--row-state-archive)';

  // V6 — la ligne commune : icône Archive dans la case de 16 px, état en texte (couleur actuelle),
  // boîte type · langue, « Remplacer », puis la colonne d'icônes de Complétude (88 px). Aucune date (règle A).
  return (
    <ListRow
      leading={<Archive className="h-4 w-4" style={{ color: couleurArchive }} aria-hidden="true" />}
      title={doc.title}
      attenue
      state={
        <span
          className="text-xs whitespace-nowrap"
          style={isSigned ? { color: 'var(--row-state-archive-certified)' } : { color: 'var(--text-muted)' }}
        >
          {tState(displayStateLabelKey(displayState, { certified: isSigned }))}
        </span>
      }
      identity={<IdentityBox type={typeAffiche(doc.document_type, 'autre')} languageCode={codeDeLangue(doc.language)} />}
      words={
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isReplacing}
          className={buttonClass}
        >
          <Upload className="h-3.5 w-3.5" />
          {tDocs('replace')}
        </button>
      }
      icons={
        <>
          {/* Voir : même comportement (window.open), en œil. Téléchargement et « ··· » : cases réservées,
              invisibles, non focusables — l'œil tombe sur la verticale des autres lignes. */}
          <button type="button" onClick={handleView} className={oeil} title={tDocs('view')} aria-label={tDocs('view')}>
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <span aria-hidden="true" className="invisible h-[26px] w-[26px]" />
          <span aria-hidden="true" className="invisible h-[26px] w-[26px]" />
        </>
      }
    >
      {/* L'input reste dans la ligne, en sœur de la div de ligne ; la fenêtre de remplacement vit à la page. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </ListRow>
  );
}
