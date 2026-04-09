'use client'

interface RegisterCardProps {
  title: string
  columns: { key: string; label: string }[]
  rows: Record<string, any>[]
  emptyMessage?: string
}

export default function RegisterCard({
  title,
  columns,
  rows,
  emptyMessage = 'Aucune donnée enregistrée',
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
    </div>
  )
}
