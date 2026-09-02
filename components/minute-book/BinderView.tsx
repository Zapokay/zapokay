'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import BinderSection from './BinderSection'
import RegisterCard from './RegisterCard'
import type { MinuteBookSection } from '@/lib/minute-book-section'
import { readSettledRegister, partitionRegisterLoads } from '@/lib/minute-book/register-loads'

/**
 * `key` is narrowed to the nine section keys so `tBinder(\`sections.${section.key}\`)`
 * resolves against minuteBook.binder.sections instead of widening to `string`.
 *
 * ⚠️ CE TYPE EST DÉSORMAIS DÉRIVÉ, PLUS RECOPIÉ. Il valait autrefois une union
 * de neuf littéraux retapée à la main, et sa propre docstring avouait le défaut :
 * « nothing will fail at compile time to remind you ». Ajouter une clé à
 * MINUTE_BOOK_SECTIONS élargit maintenant ce type mécaniquement.
 */
type SectionKey = MinuteBookSection

interface Section {
  key: SectionKey
  documents: any[]
  count: number
}

interface BinderViewProps {
  /**
   * ⚠️ LE NOMBRE ET LES ÉTAGÈRES VIENNENT DE LA MÊME RÉPONSE, et c'est la
   * contrainte de ce composant. `totalDocuments` est remonté depuis le MÊME
   * `binderData` qui pose les sections — pas d'un second appel, pas d'une somme
   * recalculée. Deux nombres tirés de deux lectures peuvent se contredire ;
   * ceux-là ne le peuvent pas.
   * Reçoit directement le setter de BinderPage : il est stable, donc il peut
   * figurer dans les dépendances de l'effet sans le relancer.
   */
  onTotalDocuments: (total: number) => void
}

export default function BinderView({ onTotalDocuments }: BinderViewProps) {
  const t = useTranslations('minuteBook.registers')
  // Section headings — localized via key-map off section.key. La route
  // n'expédie plus de title_fr : le catalogue i18n est la seule source.
  // Document/requirement NAMES inside sections stay FR legal (untouched).
  const tBinder = useTranslations('minuteBook.binder')
  const locale = useLocale()
  const [sections, setSections] = useState<Section[]>([])
  const [directors, setDirectors] = useState<any>(null)
  const [officers, setOfficers] = useState<any>(null)
  const [shareholders, setShareholders] = useState<any>(null)
  const [statedCapital, setStatedCapital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // ⚠️ L'ÉCHEC EST UN ÉTAT, PAS UNE ABSENCE. On ne déduit rien de
  // `sections.length === 0` : la route rend TOUJOURS neuf sections, donc un
  // tableau vide ne distingue pas « livre vide » de « livre non lu ».
  const [binderFailed, setBinderFailed] = useState(false)
  const [registersFailed, setRegistersFailed] = useState(0)

  useEffect(() => {
    async function fetchAll() {
      // ⚠️ allSettled ET NON all : avec `Promise.all`, le rejet d'UN SEUL appel
      // faisait sauter le bloc entier — aucune section posée, aucun registre, et
      // la page rendait un livre blanc sans un mot. Un registre en panne ne peut
      // plus emporter le Livre.
      const [binderRes, dirRes, offRes, shRes, scRes] = await Promise.allSettled([
        fetch('/api/minute-book/binder?scope=finalized'),
        fetch('/api/registers/directors'),
        fetch('/api/registers/officers'),
        fetch('/api/registers/shareholders'),
        fetch('/api/registers/stated-capital'),
      ])

      // ── Le Livre lui-même. La garde porte sur l'ÉCHEC : rejet LANCÉ
      //    (status rejected, ou json() qui lance) ou réponse non-ok RETOURNÉE.
      const binderOutcome = await readSettledRegister<{
        sections?: Section[]
        totalDocuments?: number
      }>(binderRes)
      if (binderOutcome.ok && binderOutcome.body) {
        setSections(binderOutcome.body.sections || [])
        onTotalDocuments(binderOutcome.body.totalDocuments ?? 0)
      } else {
        setBinderFailed(true)
      }

      // ── Les quatre registres, chacun retenu seulement s'il est TENU et `ok`.
      const outcomes = {
        directors: await readSettledRegister<unknown>(dirRes),
        officers: await readSettledRegister<unknown>(offRes),
        shareholders: await readSettledRegister<unknown>(shRes),
        statedCapital: await readSettledRegister<unknown>(scRes),
      }
      const { loaded, failed } = partitionRegisterLoads(outcomes)
      setDirectors(loaded.directors ?? null)
      setOfficers(loaded.officers ?? null)
      setShareholders(loaded.shareholders ?? null)
      setStatedCapital(loaded.statedCapital ?? null)
      setRegistersFailed(failed)

      setLoading(false)
    }
    fetchAll()
  }, [onTotalDocuments])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  // ⚠️ LE TABLEAU QU'ON REND EST CELUI QU'ON COMPTE. Le compteur de la section
  // affichait « 3 registres » — une chaîne FIGÉE dans le catalogue, qui ne
  // comptait rien et se trompait : quatre cartes sont rendues. Le remplacer par
  // un littéral `4` aurait recopié la faute d'un cran. Ici, une seule liste :
  // `registerCards` est passée en enfants ET sa longueur est passée au compteur,
  // donc ajouter ou retirer une carte déplace le nombre tout seul.
  const registerCards = [
    directors && (
              <RegisterCard
                  key="directors"
                title={locale === 'en' ? directors.register_title_en : directors.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'resident', label: t('columns.residence') },
                  { key: 'appointment_date', label: t('columns.start') },
                  { key: 'end_date_display', label: t('columns.end') },
                  { key: 'status', label: t('columns.active') },
                ]}
                rows={(directors.entries || []).map((e: any) => ({
                  ...e,
                  resident: e.is_canadian_resident ? t('residentYes') : t('residentNo'),
                  end_date_display: e.end_date || '—',
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">✗</span>
                  ),
                }))}
              />
    ),
    officers && (
              <RegisterCard
                  key="officers"
                title={locale === 'en' ? officers.register_title_en : officers.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'title', label: t('columns.title') },
                  { key: 'appointment_date', label: t('columns.start') },
                  { key: 'end_date_display', label: t('columns.end') },
                  { key: 'status', label: t('columns.active') },
                ]}
                rows={(officers.entries || []).map((e: any) => ({
                  ...e,
                  end_date_display: e.end_date || '—',
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">✗</span>
                  ),
                }))}
              />
    ),
    shareholders && (
              <RegisterCard
                  key="shareholders"
                title={locale === 'en' ? shareholders.register_title_en : shareholders.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'share_class', label: t('columns.shareClass') },
                  { key: 'quantity', label: t('columns.quantity') },
                  { key: 'certificate_number', label: t('columns.certificate') },
                  { key: 'issue_date', label: t('columns.issueDate') },
                ]}
                rows={(shareholders.entries || []).map((e: any) => ({
                  ...e,
                  certificate_number: e.certificate_number || '—',
                }))}
              />
    ),
    statedCapital && (
              <RegisterCard
                  key="statedCapital"
                title={locale === 'en' ? statedCapital.register_title_en : statedCapital.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'class_name', label: t('columns.shareClass') },
                  { key: 'stated_capital', label: t('columns.statedCapital') },
                ]}
                rows={(statedCapital.entries || []).map((e: any) => ({
                  ...e,
                  stated_capital: new Intl.NumberFormat(
                    locale === 'en' ? 'en-CA' : 'fr-CA',
                    { style: 'currency', currency: e.currency || 'CAD' }
                  ).format(e.stated_capital ?? 0),
                }))}
                citation={locale === 'en' ? statedCapital.citation_en : statedCapital.citation_fr}
                footnote={(() => {
                  const missing = (statedCapital.entries || []).reduce(
                    (sum: number, e: any) => sum + (e.issuances_missing_price || 0),
                    0
                  )
                  return missing > 0 ? (
                    <p className="text-[11px] text-amber-600">
                      {t('missingConsideration', { count: missing })}
                    </p>
                  ) : undefined
                })()}
              />
    ),
  ].filter(Boolean)

  const avis = 'rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-4 text-sm text-[var(--text-muted)]'

  return (
    <div className="space-y-4">
      {binderFailed && (
        <div role="alert" className={avis}>{tBinder('binderUnavailable')}</div>
      )}
      {registersFailed > 0 && (
        <div role="alert" className={avis}>
          {tBinder('registersUnavailable', { count: registersFailed })}
        </div>
      )}
      {sections.map((section, i) =>
        section.key === 'registres' ? (
          <BinderSection
            key={section.key}
            index={i}
            title={tBinder(`sections.${section.key}`)}
            documents={[]}
            registerCount={registerCards.length}
          >
            {registerCards}
          </BinderSection>
        ) : (
          <BinderSection
            key={section.key}
            index={i}
            title={tBinder(`sections.${section.key}`)}
            documents={section.documents}
          />
        )
      )}
    </div>
  )
}
