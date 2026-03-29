interface LanguageBadgeProps {
  language: string
}

const LANG_CONFIG: Record<string, { label: string; classes: string }> = {
  fr:        { label: 'FR',       classes: 'bg-[var(--info-bg)] text-[var(--info-text)] border-[var(--info-border)]' },
  en:        { label: 'EN',       classes: 'bg-[var(--card-bg)] text-[var(--text-muted)] border-[var(--card-border)]' },
  bilingual: { label: 'Bilingue', classes: 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]' },
}

export function LanguageBadge({ language }: LanguageBadgeProps) {
  const config = LANG_CONFIG[language] ?? LANG_CONFIG.en
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.classes}`}>
      {config.label}
    </span>
  )
}
