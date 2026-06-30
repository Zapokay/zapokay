'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Eye, Upload } from 'lucide-react';
import type { VaultDocument } from '@/components/documents/DocumentRow';

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

  const buttonClass =
    'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left: archive icon + title + state label */}
      <div className="flex items-center gap-3 min-w-0">
        <Archive
          className="h-5 w-5 flex-shrink-0"
          style={{ color: isSigned ? 'var(--row-state-archive-certified)' : 'var(--row-state-archive)' }}
          aria-hidden="true"
        />
        <span className="text-sm text-[var(--text-muted)] truncate">{doc.title}</span>
        <span
          className="text-xs flex-shrink-0"
          style={isSigned ? { color: 'var(--row-state-archive-certified)' } : { color: 'var(--text-muted)' }}
        >
          {isSigned ? tDocs('archivedCertifiedLabel') : tDocs('archivedLabel')}
        </span>
      </div>

      {/* Right: View + Replace */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <button type="button" onClick={handleView} className={buttonClass}>
          <Eye className="h-3.5 w-3.5" />
          {tDocs('view')}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isReplacing}
          className={buttonClass}
        >
          <Upload className="h-3.5 w-3.5" />
          {tDocs('replace')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}
