'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ActivityRow from './ActivityRow'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'
import { formatDate } from '@/lib/utils'
import { lireDateDeLActe } from '@/lib/journal-date-acte'

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
  details?: Record<string, unknown> | null
  /** Lot AC-2 — les deux personnes d'un remplacement, résolues par la route. */
  nom_sortant?: string | null
  nom_entrant?: string | null
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
          /* ★ LA DATE DE L'ACTE — lot AC-2. La TABLE décide (`lireDateDeLActe`),
             ce rendu ne fait que la dire. ⛔ Aucune clé de `details` n'est lue
             ici directement : la même clé change de sens selon l'événement, et
             c'est précisément ce que la table existe pour trancher. */
          const lecture = lireDateDeLActe(event.event_type, event.details ?? null)
          let acte: React.ReactNode
          if (lecture.forme === 'saisie') {
            acte = t('acteALaSaisie')
          } else if (lecture.forme === 'non_consignee') {
            /* ⛔ PAS UN TIRET MUET — le silence tué au lot K. La phrase dit que
               la date existe AILLEURS, et nomme le registre qui la porte. */
            acte = lecture.registre
              ? t.rich('acteNonConsigneeRegistre', {
                  registre: lecture.registre,
                  lien: (chunks) => (
                    <Link href={`/${locale}/dashboard/minute-book/binder`} className="underline">
                      {chunks}
                    </Link>
                  ),
                })
              : t('acteNonConsignee')
          } else {
            /* ⚖️ UNE LIGNE PAR EFFET, ÉTIQUETÉE PAR PERSONNE — jamais deux dates
               nues l'une sous l'autre. Un remplacement rend « Fin — X » puis
               « Nomination — Y ». */
            acte = lecture.lignes.map((l) => {
              const date = l.date ? formatDate(l.date, locale) : t('acteDateNonConsignee')
              const nom =
                l.personne === 'sortant' ? event.nom_sortant
                : l.personne === 'entrant' ? event.nom_entrant
                : null
              const texte = l.personne
                ? t('acteEffetPersonne', {
                    effet: l.effet,
                    personne: nom?.trim() || t('actePersonneInconnue', { role: l.personne }),
                    date,
                  })
                : t('acteEffet', { effet: l.effet, date })
              return <span key={l.effet} className="block">{texte}</span>
            })
          }
          return (
            <ActivityRow
              key={event.id}
              time={formatTime(event.created_at, locale)}
              title={title}
              author={auteur}
              acte={acte}
            />
          )
        })}
      </div>
    </div>
  )
}
