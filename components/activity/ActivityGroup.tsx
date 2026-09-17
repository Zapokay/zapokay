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
  author_name?: string | null
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
          // ⛔ L'AUTEUR S'AFFICHE SUR TOUTES LES LIGNES, SANS EXCEPTION. Un
          //    registre qui nomme PARFOIS l'auteur est pire qu'un registre qui
          //    ne le nomme jamais : l'absence y devient indiscernable d'un
          //    silence, et le lecteur ne sait plus lequel il regarde.
          // ⚠️ L'ABSENCE EST DONC VISIBLE, JAMAIS VIDE. Ni nom courant ni nom
          //    gelé — mesuré possible dans DEUX cas : un compte supprimé, et un
          //    `users.full_name` laissé vide.
          // ⛔ ET JAMAIS LE COURRIEL : la route ne le lit pas, et rien ici ne
          //    doit le faire entrer par une autre porte.
          //
          // ⛔⛔ « NON IDENTIFIÉ » ET SURTOUT PAS « RETIRÉ », ET CE N'EST PAS UNE
          //    NUANCE DE TON. L'absence a DEUX causes mesurées le 2026-09-17 :
          //      ① le compte a été supprimé — `user_id` passe à NULL ;
          //      ② `users.full_name` est resté VIDE sur un compte BIEN VIVANT —
          //         un des treize auteurs du parc est dans ce cas aujourd'hui.
          //    « Retiré » serait FAUX au cas ② : il dirait parti de quelqu'un qui
          //    est là. « Non identifié » est vrai des deux, et dit quand même
          //    qu'il y a EU quelqu'un — ce qu'un registre doit dire.
          //    ★ Si quelqu'un la trouve vague un jour et la « précise », il la
          //    transformera en mensonge. C'est cette note qui doit l'arrêter.
          //
          // ⚠️ `authorUnknown` PORTE DÉJÀ SON « par / by » : il REMPLACE
          //    `byAuthor`, il ne s'y emboîte pas. Emboîter rendrait « par par un
          //    utilisateur non identifié ». Les deux branches sont exclusives.
          const auteur = event.author_name?.trim()
            ? t('byAuthor', { name: event.author_name.trim() })
            : t('authorUnknown')
          return (
            <ActivityRow
              key={event.id}
              time={formatTime(event.created_at, locale)}
              title={title}
              author={auteur}
            />
          )
        })}
      </div>
    </div>
  )
}
