'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { composeDisplayName } from '@/lib/display-name'
import SectionCard from './SectionCard'
import ListRow from './ListRow'
import { IdentityBox, codeDeLangue } from './state-visuals'
import { DownloadButton } from '@/components/documents/DownloadButton'

interface Document {
  id: string
  title: string
  document_type?: string
  created_at: string
  file_url?: string
  document_year?: number | null
  /** V5 — déjà dans la réponse (route : select *) ; affichée dans la boîte d'identité. */
  language?: string | null
}

interface BinderSectionProps {
  index: number
  title: string
  documents: Document[]
  children?: React.ReactNode
  /**
   * ⚠️ LE NOMBRE DE REGISTRES RÉELLEMENT RENDUS, passé par BinderView depuis la
   * longueur du tableau qu'il rend. Il remplace `t('registres')`, une chaîne
   * FIGÉE du catalogue qui valait « 3 registres » et ne comptait rien — et qui
   * se trompait, puisque quatre cartes sont rendues.
   */
  registerCount?: number
}

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleDateString(locale === 'en' ? 'en-CA' : 'fr-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// V5 — le type s'affiche par la boîte commune, en mots de documents.types.* (comme Documents et
// Complétude) ; un type inconnu retombe sur 'autre'. binder.typeLabels a disparu (§366).
const TYPE_KEYS = ['statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'] as const
type TypeKey = (typeof TYPE_KEYS)[number]

// Type PREDICATE, not a bare `.includes()`: Array.prototype.includes returns boolean and
// does not narrow, so without this the ternary below still yields `string` and the
// type handed to IdentityBox stays `string`. This narrows with no cast.
function isTypeKey(value: string | null): value is TypeKey {
  return TYPE_KEYS.includes(value as TypeKey)
}


export default function BinderSection({
  index,
  title,
  documents,
  children,
  registerCount,
}: BinderSectionProps) {
  const sectionNumber = index + 1
  const hasContent = documents.length > 0 || !!children
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const t = useTranslations('minuteBook.binder')
  const locale = useLocale()

  function handleView(doc: Document) {
    window.open(`/api/documents/${doc.id}/download?preview=true`, '_blank', 'noopener,noreferrer')
  }


  // V2 — le Livre prend le contenant commun : ouvert par défaut, repliable s'il a du contenu,
  // INERTE s'il est vide (pas de bouton, chevron réservé). La métrique passe au catalogue (ICU, =0).
  return (
    <SectionCard
      title={title}
      marker={
        <span className="flex items-center justify-center w-7 h-7 flex-shrink-0 rounded-full bg-[var(--text-heading)] text-[var(--card-bg)] text-xs font-semibold">
          {sectionNumber}
        </span>
      }
      metric={
        children
          ? t('registerCount', { count: registerCount ?? 0 })
          : t('sectionDocumentCount', { count: documents.length })
      }
      collapsible={hasContent}
      defaultOpen
    >
      {children ? (
        <div className="px-5 pt-4 pb-5 space-y-3">{children}</div>
      ) : !hasContent ? (
        <p className="px-5 pt-4 pb-5 text-sm text-[var(--text-muted)] italic">
          {t('emptySection')}
        </p>
      ) : (
        <div className="divide-y divide-[var(--card-border)] [&>div:last-child>div:first-child]:rounded-b-[13px]">
          {documents.map((doc) => {
            // The local is REQUIRED, not stylistic: a type predicate narrows the
            // EXPRESSION it was handed. Inlining `isTypeKey(doc.document_type ?? null)`
            // and then reading `doc.document_type` in the branch tests one expression
            // and reads a SIBLING one, so the narrowing is lost and the key widens back
            // to `string`. Narrow once, into a const, then branch.
            const raw = doc.document_type ?? null
            const typeKey = isTypeKey(raw) ? raw : 'autre'
            // V5 — la ligne commune : case de 16 px VIDE (aucune pastille), titre, date (même format),
            // boîte type · langue (documents.types.*), colonne Voir · Télécharger (57 px). Ni badge ni atténuation.
            const caseIcone = 'flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-50'
            return (
              <ListRow
                key={doc.id}
                title={composeDisplayName(doc.title, null, doc.document_year)}
                date={<span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDate(doc.created_at, locale)}</span>}
                identity={<IdentityBox type={typeKey} languageCode={codeDeLangue(doc.language)} />}
                icons={
                  <>
                    {/* D5 : Voir RESTE un bouton (window.open inchangé) — un lien ne se désactive pas, et
                        la section désactive Voir et Télécharger de toutes ses lignes pendant un téléchargement. */}
                    <button
                      onClick={() => handleView(doc)}
                      disabled={loadingId !== null}
                      className={caseIcone}
                      title={t('view')}
                      aria-label={t('view')}
                    >
                      <Eye className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                    {/* D4 : le bouton commun (V4b) ; la copie locale de la logique est retirée. */}
                    <DownloadButton
                      documentId={doc.id}
                      fileName={doc.title}
                      className={caseIcone}
                      disabled={loadingId !== null && loadingId !== doc.id}
                      onBusyChange={(b) => setLoadingId(b ? doc.id : null)}
                    />
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
