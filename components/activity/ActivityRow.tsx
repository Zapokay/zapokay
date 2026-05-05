'use client'

interface ActivityRowProps {
  time: string
  title: string
}

export default function ActivityRow({ time, title }: ActivityRowProps) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-sm text-[var(--text-muted)] font-mono shrink-0 w-12">{time}</span>
      <span className="text-sm text-[var(--text-body)]">{title}</span>
    </div>
  )
}
