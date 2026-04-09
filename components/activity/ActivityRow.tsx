'use client'

interface ActivityRowProps {
  time: string
  titleFr: string
}

export default function ActivityRow({ time, titleFr }: ActivityRowProps) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-sm text-[var(--text-muted)] font-mono shrink-0 w-12">{time}</span>
      <span className="text-sm text-[var(--text-body)]">{titleFr}</span>
    </div>
  )
}
