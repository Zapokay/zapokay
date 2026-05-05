'use client'

import ActivityRow from './ActivityRow'

interface Event {
  id: string
  title_fr: string
  title_en: string
  created_at: string
}

interface ActivityGroupProps {
  label: string
  events: Event[]
  locale: string
}

function formatTime(dateStr: string, locale: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString(locale === 'en' ? 'en-CA' : 'fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function ActivityGroup({ label, events, locale }: ActivityGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-[var(--text-muted)]">{label}</h3>
        <div className="flex-1 h-px bg-[var(--card-border)]" />
      </div>
      <div className="space-y-0.5">
        {events.map((event) => (
          <ActivityRow
            key={event.id}
            time={formatTime(event.created_at, locale)}
            title={locale === 'en' ? event.title_en : event.title_fr}
          />
        ))}
      </div>
    </div>
  )
}
