'use client'

import ActivityRow from './ActivityRow'

interface Event {
  id: string
  title_fr: string
  created_at: string
}

interface ActivityGroupProps {
  label: string
  events: Event[]
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ActivityGroup({ label, events }: ActivityGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-neutral-600">{label}</h3>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>
      <div className="space-y-0.5">
        {events.map((event) => (
          <ActivityRow
            key={event.id}
            time={formatTime(event.created_at)}
            titleFr={event.title_fr}
          />
        ))}
      </div>
    </div>
  )
}
