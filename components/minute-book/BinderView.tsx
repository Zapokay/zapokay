'use client'

import { Fragment, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import BinderSection from './BinderSection'
import RegisterCard from './RegisterCard'
import {
  colonnesAdministrateurs, COLONNES_DIRIGEANTS, COLONNES_ACTIONNAIRES,
  COLONNES_CAPITAL, resoudre, RANG_ANCIENNES_DETENTIONS, type CleEtiquette,
} from '@/lib/minute-book/register-columns'
import type { MinuteBookSection } from '@/lib/minute-book-section'
import { readSettledRegister, partitionRegisterLoads } from '@/lib/minute-book/register-loads'
import type { DirectorRegisterPayload } from '@/lib/minute-book/registers'

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
  // ⛔ LES COLONNES NE SE DECLARENT PLUS ICI. Meme source que le PDF —
  // lib/minute-book/register-columns. Elles etaient ecrites DEUX FOIS, et rien
  // n'obligeait les deux listes a coincider.
  // ★ Les appels passent `true` : cette surface etale l'entree brute (`...e`),
  //   donc la date affichable porte une seconde cle. La declaration la connait.
  //
  // ★ UN Record SUR L'UNION, PAS UNE CHAINE LIBRE. next-intl type ses cles
  //   LITTERALEMENT : chacun des douze `t('columns.x')` ci-dessous est verifie
  //   contre le catalogue par tsc. Et parce que la table est un
  //   `Record<CleEtiquette, string>`, tsc refuse aussi celle qui OUBLIE un
  //   suffixe declare.
  // ⛔ Un cast sur un gabarit `columns.${k}` aurait compile et rendu une cle
  //   manquante A L'EXECUTION — la faute muette se serait deplacee, pas retiree.
  const ETIQUETTES: Record<CleEtiquette, string> = {
    name: t('columns.name'),
    nameAndAddress: t('columns.nameAndAddress'),
    residence: t('columns.residence'),
    start: t('columns.start'),
    end: t('columns.end'),
    active: t('columns.active'),
    title: t('columns.title'),
    shareClass: t('columns.shareClass'),
    quantity: t('columns.quantity'),
    certificate: t('columns.certificate'),
    issueDate: t('columns.issueDate'),
    statedCapital: t('columns.statedCapital'),
  }
  const etiq = (k: CleEtiquette) => ETIQUETTES[k]
  // Section headings — localized via key-map off section.key. La route
  // n'expédie plus de title_fr : le catalogue i18n est la seule source.
  // Document/requirement NAMES inside sections stay FR legal (untouched).
  const tBinder = useTranslations('minuteBook.binder')
  const locale = useLocale()
  const [sections, setSections] = useState<Section[]>([])
  const [directors, setDirectors] = useState<DirectorRegisterPayload | null>(null)
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
        directors: await readSettledRegister<DirectorRegisterPayload>(dirRes),
        officers: await readSettledRegister<unknown>(offRes),
        shareholders: await readSettledRegister<unknown>(shRes),
        statedCapital: await readSettledRegister<unknown>(scRes),
      }
      const { loaded, failed } = partitionRegisterLoads(outcomes)
      // ⚠️ L'ASSERTION EST A LA FRONTIERE JSON, ET ELLE Y EST DEJA :
      //    readSettledRegister fait `json() as T` (register-loads.ts:53), et
      //    partitionRegisterLoads partage UN SEUL T entre les quatre registres,
      //    qui s'effondre donc en `{}`. Aucune verification statique n'est
      //    possible de l'autre cote d'un appel HTTP.
      //    ★ CE QUI COMPTE EST EN AVAL : l'etat est type, donc une faute de
      //    frappe sur `directors.shows_residency` est REFUSEE par tsc — ce
      //    qu'elle n'etait pas avant, ou l'etat valait `any`.
      setDirectors((loaded.directors as DirectorRegisterPayload | undefined) ?? null)
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

  // Les lignes du registre des actionnaires — UNE construction, pour le
  // registre et pour sa section. La fin, dans la langue de l'ECRAN, meme choix
  // que les titres. Vide = detention en cours, aucune seconde ligne.
  const lignesActionnaires = (entries: any[]) =>
    entries.map((e: any) => ({
      ...e,
      certificate_number: e.certificate_number || '—',
      fin: locale === 'en' ? e.fin_en : e.fin_fr,
    }))

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
                // Meme booleen que le PDF, venu du meme registre : les deux
                // surfaces montrent le meme etat parce qu'elles ne decident
                // rien chacune de son cote.
                columns={resoudre(colonnesAdministrateurs(directors.shows_residency), true, etiq)}
                // ⚪ `address` ARRIVE PAR L'ETALEMENT `...e` ci-dessous, comme
                //    `full_name` : le registre la compose (lib/address.ts) et
                //    l'entree la porte. Une fiche sans adresse rend la chaine
                //    vide, donc une cellule vide — jamais un tiret.
                rows={(directors.entries || []).map((e: any) => ({
                  ...e,
                  // ⚠️ TROIS ETATS, ET LE `null` N'EST PAS UN `false`. Une ternaire
                  //    sur boolean|null rangerait l'absence avec le refus — c'est
                  //    exactement ce que le `?? true` du registre faisait a l'envers.
                  //    tsc ne signale PAS cette faute : la ternaire est legale.
                  resident:
                    e.is_canadian_resident === true ? t('residentYes')
                    : e.is_canadian_resident === false ? t('residentNo')
                    : t('residentNotDeclared'),
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
                columns={resoudre(COLONNES_DIRIGEANTS, true, etiq)}
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
    // ⚠️ UN FRAGMENT, ET CE N'EST PAS COSMETIQUE : la section « Anciennes
    //    detentions » appartient au registre des actionnaires. Posee comme une
    //    carte de plus dans cette liste, elle aurait fait dire « 5 registres »
    //    au compteur, qui compte cette liste.
    shareholders && (
              <Fragment key="shareholders">
              <RegisterCard
                title={locale === 'en' ? shareholders.register_title_en : shareholders.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={resoudre(COLONNES_ACTIONNAIRES, true, etiq)}
                rows={lignesActionnaires(shareholders.entries || [])}
              />
              {/* ★ ABSENTE quand le lecteur rend `former_holdings: null` — la
                  decision est prise la-bas, une fois, pour l'ecran et le PDF. */}
              {shareholders.former_holdings && (
                <RegisterCard
                  // Une SOUS-SECTION du registre ci-dessus : son rang vient de la
                  // declaration unique, lue aussi par le PDF.
                  rang={RANG_ANCIENNES_DETENTIONS}
                  title={locale === 'en' ? shareholders.former_holdings.register_title_en : shareholders.former_holdings.register_title_fr}
                  emptyMessage={t('emptyRegister')}
                  columns={resoudre(COLONNES_ACTIONNAIRES, true, etiq)}
                  rows={lignesActionnaires(shareholders.former_holdings.entries)}
                />
              )}
              </Fragment>
    ),
    statedCapital && (
              <RegisterCard
                  key="statedCapital"
                title={locale === 'en' ? statedCapital.register_title_en : statedCapital.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={resoudre(COLONNES_CAPITAL, true, etiq)}
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
