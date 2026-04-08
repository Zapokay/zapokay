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
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-100">
        <h4 className="font-semibold text-neutral-800 text-sm">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutral-400 italic text-center">
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
                    className="text-left px-5 py-2 text-[11px] uppercase tracking-wider text-neutral-400 font-medium"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-2.5 text-neutral-700">
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
