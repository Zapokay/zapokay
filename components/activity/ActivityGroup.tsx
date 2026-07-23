'use client'

import { useTranslations } from 'next-intl'
import ActivityRow from './ActivityRow'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'

interface Event {
  id: string
  title_fr: string
  title_en: string
  created_at: string
  event_type: string
  /** #156 — linked document's name + year (null for entity/settings events or deleted docs). */
  doc_title?: string | null
  doc_year?: number | null
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
  const t = useTranslations('activity')
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-[var(--text-muted)]">{label}</h3>
        <div className="flex-1 h-px bg-[var(--card-border)]" />
      </div>
      <div className="space-y-0.5">
        {events.map((event) => {
          // #156 — document-naming events recompose: verb (UI) + name (doc
          // language, from documents.title) + year suffix (UI). Entity/settings
          // events and deleted-doc rows fall back to the baked title on UI locale.
          let title: string
          if (
            event.doc_title &&
            (event.event_type === 'document_uploaded' || event.event_type === 'document_generated')
          ) {
            const verbKey =
              event.event_type === 'document_uploaded' ? 'documentUploaded' : 'documentGenerated'
            const yearSuffix =
              event.doc_year != null ? ` · ${getFiscalYearLabel(event.doc_year, locale)}` : ''
            title = t(verbKey, { name: event.doc_title, yearSuffix })
          } else {
            title = locale === 'en' ? event.title_en : event.title_fr
          }
          return (
            <ActivityRow
              key={event.id}
              time={formatTime(event.created_at, locale)}
              title={title}
            />
          )
        })}
      </div>
    </div>
  )
}
