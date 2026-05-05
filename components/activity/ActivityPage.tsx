'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import ActivityGroup from './ActivityGroup'

interface Event {
  id: string
  title_fr: string
  title_en: string
  event_type: string
  created_at: string
  details: Record<string, any>
}

interface GroupedEvents {
  label: string
  events: Event[]
}

function getDateLabel(
  dateStr: string,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string
): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const eventDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (eventDate.getTime() === today.getTime()) return todayLabel
  if (eventDate.getTime() === yesterday.getTime()) return yesterdayLabel

  return d.toLocaleDateString(locale === 'en' ? 'en-CA' : 'fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function groupByDate(
  events: Event[],
  locale: string,
  todayLabel: string,
  yesterdayLabel: string
): GroupedEvents[] {
  const map = new Map<string, Event[]>()
  for (const event of events) {
    const label = getDateLabel(event.created_at, locale, todayLabel, yesterdayLabel)
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(event)
  }
  return Array.from(map.entries()).map(([label, events]) => ({ label, events }))
}

const PAGE_SIZE = 50

export default function ActivityPage() {
  const t = useTranslations('activity')
  const locale = useLocale()
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const fetchEvents = useCallback(async (offset: number) => {
    const res = await fetch(`/api/activity-log?limit=${PAGE_SIZE}&offset=${offset}`)
    return res.json()
  }, [])

  useEffect(() => {
    fetchEvents(0).then((data) => {
      setEvents(data.events || [])
      setTotal(data.total || 0)
      setLoading(false)
    })
  }, [fetchEvents])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const data = await fetchEvents(events.length)
    setEvents((prev) => [...prev, ...(data.events || [])])
    setLoadingMore(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  const groups = groupByDate(events, locale, t('today'), t('yesterday'))
  const hasMore = events.length < total

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {t('pageTitle')}
          </h1>
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)]"
          >
            <Info className="w-4 h-4" />
            {showTooltip && (
              <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
                {t('tooltip')}
              </div>
            )}
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {t('eventsCount', { count: total })}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] italic py-12">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <ActivityGroup
              key={group.label}
              label={group.label}
              events={group.events}
              locale={locale}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-5 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--text-body)] hover:bg-[var(--card-bg)] transition-colors disabled:opacity-50"
          >
            {loadingMore ? t('loading') : t('loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
