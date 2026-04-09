'use client'

import { Eye, Download } from 'lucide-react'

interface Document {
  id: string
  title: string
  document_type?: string
  created_at: string
  file_url?: string
}

interface BinderSectionProps {
  index: number
  title: string
  documents: Document[]
  children?: React.ReactNode
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const TYPE_LABELS: Record<string, string> = {
  statuts: 'Statuts',
  resolution: 'Résolution',
  pv: 'PV',
  registre: 'Registre',
  rapport: 'Rapport',
  autre: 'Document',
}

export default function BinderSection({
  index,
  title,
  documents,
  children,
}: BinderSectionProps) {
  const sectionNumber = index + 1
  const hasContent = documents.length > 0 || !!children

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--text-heading)] text-[var(--card-bg)] text-xs font-semibold">
            {sectionNumber}
          </span>
          <h3 className="font-semibold text-[var(--text-body)]">{title}</h3>
        </div>
        <span className="text-sm text-[var(--text-muted)]">
          {children
            ? '3 registres'
            : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {children ? (
        <div className="px-5 pb-5 space-y-3">{children}</div>
      ) : !hasContent ? (
        <p className="px-5 pb-5 text-sm text-[var(--text-muted)] italic">
          Aucun document dans cette section
        </p>
      ) : (
        <div className="divide-y divide-[var(--card-border)]">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-5 py-3 hover:bg-[var(--page-bg)] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--card-border)] text-[var(--text-muted)]">
                  {TYPE_LABELS[doc.document_type || ''] || 'Document'}
                </span>
                <span className="text-sm text-[var(--text-body)] truncate">{doc.title}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <span className="text-xs text-[var(--text-muted)]">{formatDate(doc.created_at)}</span>
                <button
                  className="text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors"
                  title="Voir"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
