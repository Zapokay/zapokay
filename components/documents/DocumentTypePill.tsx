type DocumentType = 'statuts' | 'resolution' | 'pv' | 'registre' | 'rapport' | 'autre'

interface DocumentTypePillProps {
  type: DocumentType | string
  size?: 'sm' | 'md'
}

const TYPE_CONFIG: Record<string, { initials: string; bgClass: string; textClass: string }> = {
  statuts:    { initials: 'ST',  bgClass: 'bg-[var(--navy-600)]',    textClass: 'text-white' },
  resolution: { initials: 'RÉS', bgClass: 'bg-[var(--amber-600)]',   textClass: 'text-white' },
  pv:         { initials: 'PV',  bgClass: 'bg-[var(--success-text)]', textClass: 'text-white' },
  registre:   { initials: 'REG', bgClass: 'bg-[var(--navy-400)]',    textClass: 'text-white' },
  rapport:    { initials: 'RAP', bgClass: 'bg-[var(--text-muted)]',  textClass: 'text-white' },
  autre:      { initials: 'PDF', bgClass: 'bg-[var(--card-border)]', textClass: 'text-[var(--text-body)]' },
}

export function DocumentTypePill({ type, size = 'md' }: DocumentTypePillProps) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.autre
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-[9px]' : 'w-9 h-9 text-[10px]'

  return (
    <div
      className={`${sizeClass} ${config.bgClass} ${config.textClass} rounded-lg flex items-center justify-center font-bold flex-shrink-0`}
      style={{ fontFamily: 'Sora, sans-serif' }}
    >
      {config.initials}
    </div>
  )
}
