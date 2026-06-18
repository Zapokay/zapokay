'use client'

import type { ReactNode } from 'react'

interface RegisterCardProps {
  title: string
  columns: { key: string; label: string }[]
  rows: Record<string, any>[]
  emptyMessage?: string
  citation?: string
  footnote?: ReactNode
}

export default function RegisterCard({
  title,
  columns,
  rows,
  emptyMessage = 'Aucune donnée enregistrée',
  citation,
  footnote,
}: RegisterCardProps) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--card-border)]">
        <h4 className="font-semibold text-[var(--text-body)] text-sm">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--text-muted)] italic text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-5 py-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--card-border)] last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-2.5 text-[var(--text-body)]">
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(footnote || citation) && (
        <div className="px-5 py-3 border-t border-[var(--card-border)] space-y-1.5">
          {footnote}
          {/* ⚠️ YELLOW — PENDING LAWYER GREEN — stated-capital citation (art.68 LSAQ / s.26 CBCA) */}
          {citation && (
            <p className="text-[11px] italic text-[var(--text-muted)]">{citation}</p>
          )}
        </div>
      )}
    </div>
  )
}
