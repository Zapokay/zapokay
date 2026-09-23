'use client'

import { useEffect, useState, useCallback } from 'react'
import { AttenteDePage } from '@/components/ui/AttenteDePage';
import { useLocale, useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import ActivityGroup from './ActivityGroup'
import { formatDate } from '@/lib/utils'
import { readSettledRegister } from '@/lib/minute-book/register-loads'
import { SectionEnEchec } from '@/components/ui/SectionEnEchec'
import { ligneOrigine } from '@/lib/journal-origine'

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

interface ActivityPageProps {
  /** `companies.created_at` — le moment où le livre est entré chez nous. */
  registerOpenedAt: string | null
  /** `companies.incorporation_date`, NULLABLE : la phrase disparaît alors. */
  incorporationDate: string | null
}

export default function ActivityPage({ registerOpenedAt, incorporationDate }: ActivityPageProps) {
  const t = useTranslations('activity')
  const locale = useLocale()
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  /** ⛔ La lecture du journal a ÉCHOUÉ — distinct d'un journal vide. */
  const [echec, setEchec] = useState(false)

  // ★ LA FRONTIÈRE DU REGISTRE. Calculée, jamais stockée — l'écrire au journal
  //   serait fabriquer une entrée. `formatDate` est le seul formateur du dépôt ;
  //   en écrire un second ici serait une seconde vérité sur les dates.
  // ⚪ Sans `registerOpenedAt` il n'y a rien d'honnête à dire : la ligne
  //   disparaît, et l'état vide d'origine reprend sa place.
  const origine = registerOpenedAt
    ? ligneOrigine(
        t as (cle: string, params?: Record<string, string>) => string,
        {
          registreOuvertLe: formatDate(registerOpenedAt, locale),
          constitueeLe: incorporationDate ? formatDate(incorporationDate, locale) : null,
        },
        events.length === 0,
      )
    : null

  /**
   * ⛔⛔ « AUCUN ÉVÉNEMENT ENREGISTRÉ » SUR UN REGISTRE QU'ON N'A PAS SU LIRE.
   *
   * ⚖️ Lot AG-1, 2026-09-22. `fetch(...).json()` ne testait NI `res.ok` NI le
   * rejet : un 401 ou un 500 rendait `data.total || 0` et `data.events || []`,
   * donc le compteur disparaissait et la page affichait la frontière du
   * registre — « Registre ouvert le X. Aucun événement depuis. » C'est
   * l'affirmation la plus grave que ce produit puisse faire à tort : il ne
   * s'est RIEN passé dans votre société.
   *
   * ★ LE TRAITEMENT N'EST PAS INVENTÉ : c'est celui du lot K, par le lecteur
   * du lot AD. `readSettledRegister` distingue les DEUX chemins d'échec — le
   * rejet LANCÉ et la réponse non-`ok` RETOURNÉE — et `SectionEnEchec` dit
   * l'échec avec sa reprise. Les deux existent, on les consomme.
   *
   * ⚠️ ET LE COMPTE NE DEVIENT PAS ZÉRO : il devient INCONNU. Sur un échec on
   * ne sait pas combien il y a de lignes ; afficher un nombre serait remplacer
   * un mensonge par un autre. Le compteur se tait ET l'avis parle — c'est
   * l'avis qui porte le fait, pas l'absence de chiffre.
   */
  const fetchEvents = useCallback(async (offset: number) => {
    const [issue] = await Promise.allSettled([
      fetch(`/api/activity-log?limit=${PAGE_SIZE}&offset=${offset}`),
    ])
    return readSettledRegister<{ events?: Event[]; total?: number }>(issue)
  }, [])

  /** ⚪ UNE SEULE DÉFINITION DU CHARGEMENT, pour le montage ET pour la reprise.
   *  L'écrire deux fois ferait deux chemins pour un fait, et la reprise
   *  finirait par diverger de la première lecture. */
  const charger = useCallback(() => {
    setEchec(false)
    setLoading(true)
    fetchEvents(0).then((issue) => {
      if (issue.ok && issue.body) {
        setEvents(issue.body.events || [])
        setTotal(issue.body.total || 0)
      } else {
        setEchec(true)
      }
      setLoading(false)
    })
  }, [fetchEvents])

  useEffect(() => { charger() }, [charger])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const issue = await fetchEvents(events.length)
    /* ⚪ LA SUITE QUI ÉCHOUE N'EFFACE PAS CE QUI EST LÀ : les lignes déjà lues
       restent, et l'avis s'ajoute sous elles. Une page qui se viderait au
       « charger plus » perdrait ce qu'elle avait su lire. */
    if (issue.ok && issue.body) setEvents((prev) => [...prev, ...(issue.body!.events || [])])
    else setEchec(true)
    setLoadingMore(false)
  }

  if (loading) {
    return <AttenteDePage />
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
        {/* ⛔ LE COMPTEUR SE TAIT QUAND IL N'Y A RIEN À COMPTER. À zéro il rendait
            « Aucun événement enregistré » — le MÊME fait que la frontière du
            registre, quatre lignes plus bas, à quatre mots près. Deux phrases qui
            disent la même chose à moitié, c'est ce que le lot précédent a créé
            sans le voir. Une ligne se lit, un dénombrement se consulte : à zéro
            il n'y a rien à dénombrer.
            ⛔⛔ MAIS LA BRANCHE `=0` RESTE AU CATALOGUE, ET CE N'EST PAS UN OUBLI.
            La retirer ferait tomber un rendu à zéro dans `other` — « 0 événements
            enregistrés », faux de FORME en français, qui est grammaticalement
            singulier pour zéro. C'est un REPLI DÉFENSIF, pas un état affiché :
            elle a un chemin, et on souhaite ne jamais l'emprunter.
            ★ Si quelqu'un la trouve « inutile » un jour et la supprime, c'est ce
            commentaire qui doit l'arrêter — une règle périmée laissée sans sa
            raison a produit trois défauts corrigés aujourd'hui. */}
        {total > 0 && (
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {t('eventsCount', { count: total })}
          </p>
        )}
      </div>

      {/* ⛔ TROIS CAS, ET LES DEUX PREMIERS ÉTAIENT CONFONDUS.
          · la lecture a ÉCHOUÉ  → l'avis, avec sa reprise ;
          · elle a réussi, VIDE  → la frontière du registre, INCHANGÉE ;
          · elle a réussi, pleine → les groupes, inchangés.
          ★ LE VRAI ZÉRO EST LE CAS LE PLUS IMPORTANT DU LOT : un journal
          réellement vide doit toujours dire depuis quand il regarde. Si on le
          perd, on a remplacé un mensonge par un autre. */}
      {echec ? (
        <SectionEnEchec section={t('pageTitle')} onRetry={charger} />
      ) : events.length === 0 ? (
        /* ⛔ PLUS D'ÉTAT VIDE NU. « Aucun événement enregistré pour le moment »
           était exact et se lisait comme « ce produit ne consigne rien ». La
           frontière du registre le remplace : elle dit DEPUIS QUAND il regarde.
           ⚪ MAIS `activity.empty` RESTE, COMME DERNIER REPLI. Depuis que la
           frontière existe, il n'est plus atteignable que si `registerOpenedAt`
           est nul — c'est-à-dire si la SOCIÉTÉ elle-même est absente. Ce n'est
           pas une entrée morte : une entrée morte n'a AUCUN chemin, celle-ci en
           a un qu'on souhaite ne jamais emprunter. Ne pas le « nettoyer ». */
        <p className="text-center text-[var(--text-muted)] italic py-12">
          {origine ?? t('empty')}
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

      {/* ⛔ AU PIED DE LA LISTE, JAMAIS EN TÊTE — là où serait la plus vieille
          entrée, parce que c'est là que le registre s'arrête de savoir.
          ⛔ ET SEULEMENT QUAND TOUT EST CHARGÉ (`!hasMore`). Tant qu'un
          « Charger plus » reste, le pied de liste N'EST PAS la plus vieille
          entrée : la ligne y mentirait sur sa propre position.
          ⚪ Style minimal et délibéré : c'est une FRONTIÈRE de registre, pas un
          état vide ni un message d'erreur. Son traitement viendra au Visual
          Update ; la sur-styler maintenant préempterait cette décision. */}
      {origine && events.length > 0 && !hasMore && (
        <p className="text-center text-xs text-[var(--text-muted)] italic mt-8">
          {origine}
        </p>
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
