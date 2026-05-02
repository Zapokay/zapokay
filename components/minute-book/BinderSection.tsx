'use client'

import { useState } from 'react'
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

const spinnerIcon = (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function BinderSection({
  index,
  title,
  documents,
  children,
}: BinderSectionProps) {
  const sectionNumber = index + 1
  const hasContent = documents.length > 0 || !!children
  const [loadingId, setLoadingId] = useState<string | null>(null)

  function handleView(doc: Document) {
    window.open(`/api/documents/${doc.id}/download?preview=true`, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload(doc: Document) {
    setLoadingId(doc.id)
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = doc.title || 'document'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } finally {
      setLoadingId(null)
    }
  }

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
                  onClick={() => handleView(doc)}
                  disabled={loadingId !== null}
                  className="text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors disabled:opacity-50"
                  title="Voir"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={loadingId !== null}
                  className="text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors disabled:opacity-50"
                  title="Télécharger"
                >
                  {loadingId === doc.id ? spinnerIcon : <Download className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
