'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GeneratedFile } from '../CatchUpWizard'

interface StepDownloadProps {
  files: GeneratedFile[]
  locale: 'fr' | 'en'
  onRestart: () => void
}

export function StepDownload({ files, locale, onRestart }: StepDownloadProps) {
  const fr = locale === 'fr'
  const router = useRouter()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function getSignedUrl(file: GeneratedFile): Promise<string | null> {
    const res = await fetch('/api/wizard/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: file.id, storagePath: file.storagePath }),
    })
    const data = await res.json()
    return data.signedUrl ?? null
  }

  async function handleView(file: GeneratedFile) {
    setViewingId(file.id)
    try {
      const signedUrl = await getSignedUrl(file)
      window.open(signedUrl ?? file.fileUrl, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(file.fileUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setViewingId(null)
    }
  }

  async function handleDownload(file: GeneratedFile) {
    setDownloadingId(file.id)
    try {
      // Fetch binary content via stream endpoint → triggers real file download
      const res = await fetch('/api/wizard/download?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: file.id, storagePath: file.storagePath }),
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.title + '.txt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback to signed URL in new tab
      try {
        const signedUrl = await getSignedUrl(file)
        if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer')
      } catch {
        // silent fail
      }
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Success banner ──────────────────────────────────────────────── */}
      <div
        className="rounded-lg p-4 flex gap-3"
        style={{ backgroundColor: '#F0F4EE', border: '1px solid #B8CCAF' }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="#2E5425">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#2E5425' }}>
            {fr
              ? `${files.length} document${files.length > 1 ? 's' : ''} généré${files.length > 1 ? 's' : ''} avec succès`
              : `${files.length} document${files.length > 1 ? 's' : ''} generated successfully`}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#2E5425' }}>
            {fr
              ? 'Les fichiers ont été ajoutés à votre coffre-fort de documents.'
              : 'Files have been added to your document vault.'}
          </p>
        </div>
      </div>

      {/* ── File list ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]"
          >
            {/* Icon */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#FFF8E7' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#F5B91E">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
                {file.title}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {fr ? `Exercice ${file.year}` : `Fiscal year ${file.year}`}
                {' · '}
                {file.type === 'board'
                  ? fr ? 'Résolution conseil' : 'Board resolution'
                  : fr ? 'PV actionnaires' : 'Shareholder minutes'}
                {' · .txt'}
              </p>
            </div>

            {/* Buttons: Télécharger + Voir */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Télécharger ↓ */}
              <button
                onClick={() => handleDownload(file)}
                disabled={downloadingId === file.id || viewingId === file.id}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
              >
                {downloadingId === file.id ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  fr ? 'Télécharger ↓' : 'Download ↓'
                )}
              </button>

              {/* Voir */}
              <button
                onClick={() => handleView(file)}
                disabled={viewingId === file.id || downloadingId === file.id}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
                style={{
                  borderColor: 'var(--neutral-200)',
                  color: 'var(--text-body)',
                  backgroundColor: 'transparent',
                }}
              >
                {viewingId === file.id ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  fr ? 'Voir' : 'View'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Section signature manuelle ───────────────────────────────────── */}
      <div
        style={{
          borderLeft: '4px solid #CBD5E5',
          background: '#FAF8F4',
          borderRadius: '0 8px 8px 0',
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            fontFamily: 'Sora, sans-serif',
            fontSize: '13px',
            fontWeight: 700,
            color: '#070E1C',
            marginBottom: '6px',
          }}
        >
          📋{' '}
          {fr ? 'Prochaine étape — Signature manuelle' : 'Next step — Manual signature'}
        </div>
        <div style={{ fontSize: '13px', color: '#5A524A', lineHeight: 1.6 }}>
          {fr
            ? 'Téléchargez chaque document, faites-le signer par les parties concernées, puis uploadez la version signée dans votre Document Vault.'
            : 'Download each document, have it signed by the relevant parties, then upload the signed version to your Document Vault.'}
        </div>
      </div>

      {/* ── FIX 4 — Teaser e-signature (discret) ────────────────────────── */}
      <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
        ⚡{' '}
        {fr
          ? 'La signature électronique intégrée arrive prochainement.'
          : 'Integrated e-signature is coming soon.'}
        {' '}
        <button
          style={{
            color: 'var(--amber-600)',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline',
          }}
        >
          {fr ? 'Me notifier en priorité →' : 'Get notified first →'}
        </button>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onRestart}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors"
          style={{
            borderColor: 'var(--neutral-200)',
            color: 'var(--text-body)',
            backgroundColor: 'transparent',
          }}
        >
          {fr ? '↺ Nouveau wizard' : '↺ New wizard'}
        </button>
        <button
          onClick={() => router.push(`/${locale}/dashboard/documents?refresh=${Date.now()}`)}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)', border: 'none', cursor: 'pointer' }}
        >
          {fr ? 'Voir mes documents →' : 'View my documents →'}
        </button>
      </div>
    </div>
  )
}
