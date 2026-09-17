'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'
import LanguageToggle from '@/components/ui/LanguageToggle'

interface FiscalYearsSetupProps {
  locale: string
  companyId: string
  savedFiscalYears: { year: number; status: string }[]
  documentYears: number[]
  /**
   * LA DÉCLARATION DES EXERCICES (lib/active-years.ts), calculée par la page au
   * serveur. `exercices` est décroissant, pour l'affichage.
   */
  exercices: number[]
  /** L'exercice en cours — celui qui porte la pastille. */
  exerciceEnCours: number
  /**
   * Les exercices VERROUILLÉS — l'exercice en cours et le dernier terminé. Cochés, ils ne se
   * décochent pas : le produit y réclame déjà quelque chose.
   */
  exercicesVerrouilles: number[]
  /** Les exercices que le score lit — ce qui est coché à l'ouverture. */
  suivis: number[]
}

export function FiscalYearsSetup({
  locale,
  companyId,
  savedFiscalYears,
  documentYears,
  exercices,
  exerciceEnCours,
  exercicesVerrouilles,
  suivis,
}: FiscalYearsSetupProps) {
  const router = useRouter()
  const supabase = createClient()
  const fr = locale === 'fr'
  // ⚪ `useTranslations` LIT LA LOCALE DE L'URL, et ici c'est la bonne : `locale`
  //    est une prop qui vient des params de la page, donc la MÊME. Les trois
  //    langues du produit ne divergent pas sur cet écran (§359).
  const t = useTranslations('onboarding')
  // Même forme qu'à l'étape 5 (StepShareholders) : un second lecteur pour le
  // namespace `common`, où vivent la phrase d'échec déjà employée par le produit
  // (`common.saveFailed`) et `common.fiscalYears` — le compte des exercices suivis et
  // l'exercice en cours, partagés avec les Réglages.
  const tCommon = useTranslations('common')

  // ★ AUCUNE HORLOGE ICI. La liste, l'exercice en cours et les exercices suivis arrivent
  // de la page, calculés au serveur par la seule déclaration (lib/active-years.ts). Cet
  // écran calculait sa liste sur l'horloge du NAVIGATEUR, avec une date de constitution
  // lue en UTC : son rendu serveur et son rendu navigateur divergeaient, et c'est le
  // navigateur qui écrivait — un exercice antérieur à la constitution, coché d'office.
  // Sa pastille, calculée à part, disparaissait le dernier jour d'un exercice.
  // ★ SANS LIGNE ACTIVE, `suivis` VAUT LES EXERCICES VERROUILLÉS — le dernier terminé et
  // l'en-cours. Tout ce qui est plus ancien est montré décoché, et le client choisit ce qu'il
  // rattrape (décision de Dom, 2026-09-13). « Passer » mène donc exactement où mène
  // « Terminer » sans rien toucher.
  const years = exercices
  const [activeYears, setActiveYears] = useState<Set<number>>(() => new Set(suivis))
  const [saving, setSaving] = useState(false)
  // ⚠️ CE FICHIER N'AVAIT AUCUN CANAL DE MESSAGE. Deux états seulement —
  // `activeYears` et `saving` — donc rien qui puisse porter un échec, et donc
  // quatre écritures dont l'échec ne pouvait atteindre aucun écran.
  const [saveError, setSaveError] = useState<string | null>(null)

  const docYearSet = new Set(documentYears)

  // ★★ UNE SEULE DÉCLARATION DE « CE QUI N'EST PAS ENREGISTRÉ », DEUX LECTEURS :
  //    le bouton « Terminer », qui l'écrit, et l'avertissement, qui décide de
  //    sortir ou non. Deux copies de ce calcul diverger aient un jour, et
  //    l'avertissement mentirait dans un sens ou dans l'autre.
  // ⭐ ET C'EST PLUS JUSTE QU'UN DRAPEAU « L'UTILISATEUR Y A TOUCHÉ ». Le dépôt
  //    a `titleDirty`, qui se lève au premier clic et ne se baisse jamais : il
  //    avertirait quelqu'un qui coche puis décoche et revient à l'état initial.
  //    Celui-ci compare à la BASE — cocher puis décocher n'avertit pas.
  // ⚪ `storedActive` ne lit que `status === 'active'` : les lignes `archived` et
  //    `hold` restent hors de portée par construction, sans qu'un filtre ait à
  //    les nommer. C'est la règle déjà écrite plus bas, et elle vaut ici aussi.
  const storedActive = new Set(
    savedFiscalYears.filter(fy => fy.status === 'active').map(fy => fy.year)
  )
  const aActiver = Array.from(activeYears).filter(y => !storedActive.has(y))
  const aArchiver = Array.from(storedActive).filter(
    y => !activeYears.has(y) && !docYearSet.has(y)
  )
  const riendAEnregistrer = aActiver.length === 0 && aArchiver.length === 0

  // ── LA FERMETURE D'ONGLET ET LE RECHARGEMENT ───────────────────────────────
  // ⚪⚪ LE NAVIGATEUR IGNORE NOTRE TEXTE, ET CE N'EST PAS UN DÉFAUT DU CODE.
  //    Depuis 2017, tous les navigateurs affichent LEUR propre phrase générique
  //    et jettent la nôtre. Ne pas passer une heure à chercher pourquoi la
  //    chaîne du catalogue ne sort pas : elle ne sortira jamais ici. Elle sert
  //    à l'autre sortie, celle qu'on contrôle — « Passer ».
  // ⛔ ET LE « PRÉCÉDENT » DU NAVIGATEUR N'EST PAS COUVERT, DÉLIBÉRÉMENT. Next
  //    n'offre pas de garde d'interruption de route pour l'App Router, et les
  //    contournements connus — repousser `history.pushState`, écouter
  //    `popstate` — RÉÉCRIVENT l'historique de l'utilisateur et cassent son
  //    bouton pour de bon. Un avertissement de plus ne vaut pas un navigateur
  //    abîmé. La sortie reste ouverte, et elle est nommée ici pour qu'on ne
  //    croie pas l'avoir fermée.
  useEffect(() => {
    if (riendAEnregistrer) return
    const avertir = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // ⚪ Valeur héritée : `returnValue` est ignorée mais reste exigée par
      //    certains navigateurs pour que l'invite s'affiche du tout.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avertir)
    return () => window.removeEventListener('beforeunload', avertir)
  }, [riendAEnregistrer])
  const allSelected = years.every(y => activeYears.has(y))

  // ⚪ N'EST PLUS `async` : il ne reste aucune attente. Le signaler par la
  //    signature vaut mieux qu'une promesse vide que personne n'attend.
  function toggleYear(year: number) {
    // ⛔ Un exercice verrouillé et coché ne se décoche pas (lib/active-years.ts) : le bouton est
    // désactivé, cette ligne est la ceinture. Verrouillé mais décoché — une ligne archivée
    // d'avant ce lot —, il peut être coché, et il est alors verrouillé.
    if (docYearSet.has(year) || (exercicesVerrouilles.includes(year) && activeYears.has(year))) return
    const isActive = activeYears.has(year)
    const next = new Set(activeYears)
    if (isActive) {
      next.delete(year)
    } else {
      next.add(year)
    }
    setSaveError(null)
    setActiveYears(next)

    // ⛔⛔ CETTE BASCULE N'ÉCRIT PLUS RIEN. Elle écrivait à chaque clic pendant
    //    que `handleStart` écrivait AUSSI, au bouton — deux modèles dans le même
    //    écran, et donc un état à moitié enregistré dès qu'on quittait sans
    //    « Terminer ».
    // ⚖️ DÉCISION DE DOM, 2026-09-17 : « un état à moitié enregistré est PIRE
    //    qu'un état vide — le vide se voit, la moitié se déguise en choix. »
    //    Les exercices décident de l'année à laquelle chaque document appartient.
    // ★ `handleStart` COUVRE DÉJÀ LES TROIS CAS, et c'est mesuré, pas supposé :
    //    aucune ligne → l'upsert insère ; ligne `archived` → le même upsert la
    //    remonte, parce qu'il porte `onConflict` que celui-ci n'avait pas ;
    //    ligne `active` décochée → l'update l'archive.
    // ⚪ L'ÉCRAN NE PROMETTAIT RIEN : ni pastille, ni « enregistré », ni
    //    `togglingYear`. Le retrait ne trahit donc aucune promesse visuelle — il
    //    rend l'écran conforme à ce qu'il montrait déjà. (`SettingsClient`, lui,
    //    a un `togglingYear` PARCE QU'il écrit au clic ; il n'est pas touché.)
    // ⚪ ET LE REPLI EST PARTI AVEC L'ÉCRITURE. Il annulait la bascule quand la
    //    base refusait ; sans écriture, il n'y a plus rien à annuler. L'échec se
    //    signale désormais au seul endroit où il peut se produire : « Terminer ».
  }

  function toggleAll() {
    if (allSelected) {
      // ⚠️ LA SECONDE PORTE, ET ELLE ÉTAIT GRANDE OUVERTE. `toggleYear` refuse de
      // toucher une année qui porte des documents ; ce geste-ci vidait l'ensemble
      // sans jamais la consulter, et l'enregistrement archivait ensuite ce que la
      // bascule avait refusé de décocher. Les années protégées survivent donc au
      // « tout désélectionner » : elles restent cochées et marquées, comme le
      // rendu les montre déjà.
      // ⛔ Aucun message ici : désélectionner tout n'est pas une erreur.
      // Les exercices verrouillés restent cochés, eux aussi : ils ne sont pas des interrupteurs.
      setActiveYears(new Set(Array.from(activeYears).filter(y => docYearSet.has(y) || exercicesVerrouilles.includes(y))))
    } else {
      // ⚠️ UNION, PAS REMPLACEMENT. `new Set(years)` aurait écarté toute année
      // déjà active hors de la fenêtre rendue — un « tout sélectionner » qui
      // désélectionne. La règle vaut donc dans les deux sens : ce geste n'enlève
      // rien.
      setActiveYears(new Set([...Array.from(activeYears), ...years]))
    }
  }

  async function handleStart() {
    setSaving(true)
    setSaveError(null)

    // ⚠️⚠️ CET ÉCRAN N'A PLUS DE `delete`. Il effaçait TOUTES les lignes de la
    // société avant de réécrire les cochées — donc aussi celles qu'il n'affiche
    // pas : les `archived`, et les `hold` dont il ignore jusqu'à l'existence.
    // Mesuré sur le parc le 2026-08-31 : deux sociétés en portaient, dont une
    // réelle. Il gouverne UNE chose, quelles années sont `active` ; il n'a
    // aucune autorité sur le reste.
    //
    // ★ LES LIGNES NON `active` N'ENTRENT DANS AUCUN DES DEUX ENSEMBLES, par
    // construction : les deux se calculent à partir de `storedActive`. Elles
    // sont hors de portée sans qu'un filtre ait à les nommer — ce qui vaut aussi
    // pour un quatrième statut qu'on ajouterait demain.
    // ⚪ LE CALCUL EST HISSÉ : voir la déclaration en tête du composant. Il vit
    //    là parce que l'avertissement de sortie le lit AUSSI — une seule vérité
    //    sur « ce qui n'est pas encore enregistré ».
    //    ⛔ `docYearSet` y est exclu de `aArchiver` par ceinture : ② rend le cas
    //    théoriquement inatteignable, mais une intersection coûte moins qu'une
    //    régression.

    // ★ RIEN À DIRE, RIEN À ÉCRIRE. Un « Terminer » sans changement n'émet
    // aucune requête.
    if (riendAEnregistrer) {
      router.push(`/${locale}/dashboard`)
      router.refresh()
      return
    }

    let dbError: unknown = null
    try {
      if (aActiver.length > 0) {
        // Forme de SettingsClient : l'upsert sur (company_id, year) couvre d'un
        // geste l'année neuve et l'année qui remonte d'`archived`. La contrainte
        // unique existe et est valide — vérifié au schéma.
        const { error } = await supabase
          .from('company_fiscal_years')
          .upsert(
            aActiver.map(year => ({ company_id: companyId, year, status: 'active' })),
            { onConflict: 'company_id,year' },
          )
        dbError = error
      }
      if (!dbError && aArchiver.length > 0) {
        // Forme de SettingsClient, généralisée d'une année à un ensemble :
        // `.eq('year', y)` devient `.in('year', ys)`. Rien d'autre ne change.
        const { error } = await supabase
          .from('company_fiscal_years')
          .update({ status: 'archived' })
          .eq('company_id', companyId)
          .in('year', aArchiver)
        dbError = error
      }
    } catch (err) {
      console.error('[onboarding] fiscal years finish threw:', err)
      dbError = err
    }

    // ⚠️ ON NE NAVIGUE QUE SI LES DEUX ONT RÉUSSI. Le DELETE efface TOUS les
    // exercices de la société avant que l'INSERT ne les repose : partir au
    // tableau de bord après un INSERT échoué, c'est annoncer un succès en
    // ouvrant sur une conformité vidée — et douze fichiers lisent cette table.
    // ⚠️ ET `saving` EST RELÂCHÉ ICI, sur le chemin d'échec seulement. Il ne
    // l'était nulle part : c'est ce qui figeait le bouton sur « Chargement… »
    // sans un mot. Sur le succès la navigation démonte, et relâcher ouvrirait
    // une fenêtre d'un rendu où le bouton est cliquable une seconde fois.
    if (dbError) {
      setSaveError(tCommon('saveFailed'))
      setSaving(false)
      return
    }

    router.push(`/${locale}/dashboard`)
    router.refresh()
  }

  // ── Stepper config (labels live in messages/{fr,en}.json under onboarding.stepLabels) ─
  const STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const
  const STEP = 8
  const AMBER = '#F5B91E'
  const PAGE = 'var(--page-bg)'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>

      {/* ─── Header ─── */}
      <header style={{
        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
      }}>
        {/* Left: Z tag + ZapOkay signature */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '6px', background: '#1C1A17', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '18px', color: '#F5B91E', lineHeight: 1 }}>Z</span>
            <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#F5B91E', border: '1.5px solid var(--page-bg)' }} />
          </div>
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '14px', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#F5B91E' }}>Zap</span>
            <span style={{ color: 'var(--wm-okay)' }}>Okay</span>
          </span>
        </div>

        {/* Right: Aide + FR/EN toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="#" style={{ fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {fr ? 'Aide' : 'Help'}
          </a>
          <LanguageToggle />
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div style={{ padding: '24px 32px 0', maxWidth: '820px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
          {STEP_NUMBERS.map((sNum, i) => {
            const done = sNum < STEP
            const current = sNum === STEP
            const isLast = i === STEP_NUMBERS.length - 1
            return (
              <React.Fragment key={i}>
                <div style={{ width: '88px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: done || current ? AMBER : 'var(--ob-circle-todo-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    outline: `3px solid ${PAGE}`,
                    outlineOffset: '0px',
                    flexShrink: 0,
                    zIndex: 1, position: 'relative',
                  }}>
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span style={{
                        fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '11px',
                        color: current ? 'white' : 'var(--ob-circle-todo-text)',
                      }}>{sNum}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '9px', fontWeight: current ? 700 : 400,
                    color: current ? 'var(--ob-label-active)' : 'var(--ob-label-done)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '88px', textAlign: 'center',
                  }}>
                    {t(`stepLabels.step${sNum}`)}
                  </span>
                </div>
                {!isLast && (
                  <div style={{
                    flex: 1, height: '4px', flexShrink: 1,
                    marginTop: '14px',
                    zIndex: 0,
                    background: done ? AMBER : 'var(--ob-track-bg)',
                    transition: 'background 300ms',
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ─── Main content ─── */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 24px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Step icon — 56x56 */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'rgba(245,185,30,0.20)',
            border: '1px solid rgba(245,185,30,0.50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '16px',
            color: '#C4900A',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
            </svg>
          </div>

          {/* Step label */}
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#C4900A',
            textAlign: 'center', marginBottom: '10px',
          }}>
            {fr ? 'ÉTAPE 8 — EXERCICES FINANCIERS' : 'STEP 8 — FISCAL YEARS'}
          </p>

          {/* Title */}
          <h1 style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '28px',
            color: 'var(--text-heading)', textAlign: 'center', lineHeight: 1.25,
            marginBottom: '24px',
          }}>
            {fr
              ? <>Quels exercices souhaitez-<br />vous suivre ?</>
              : <>Which fiscal years do you<br />want to track?</>}
          </h1>

          {/* Form card */}
          <div style={{
            width: '100%',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            marginBottom: '20px',
          }}>
            {/* ★ LE DÉNOMINATEUR (§324) + Select all toggle. Aucun plafond ne cache plus
                d'exercice : l'écran dit combien la société en a, et combien seront suivis. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {tCommon('fiscalYears.trackedCount', {
                  tracked: years.filter(y => activeYears.has(y)).length,
                  total: years.length,
                })}
              </span>
              <button
                onClick={toggleAll}
                style={{
                  fontSize: '12px', fontWeight: 500, color: '#C4900A',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textDecoration: 'underline', padding: 0,
                }}
              >
                {allSelected
                  ? (fr ? 'Tout désélectionner' : 'Deselect all')
                  : (fr ? 'Tout sélectionner' : 'Select all')}
              </button>
            </div>

            {/* Year list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {years.map(year => {
                const isActive = activeYears.has(year)
                const hasDoc = docYearSet.has(year)
                const isCurrent = year === exerciceEnCours
                const isLocked = isActive && exercicesVerrouilles.includes(year)
                return (
                  <button
                    key={year}
                    onClick={() => toggleYear(year)}
                    disabled={hasDoc || isLocked}
                    title={
                      hasDoc
                        ? (fr ? 'Des documents existent pour cette année' : 'Documents exist for this year')
                        : isLocked
                          ? tCommon('fiscalYears.lockedAlwaysTracked')
                          : undefined
                    }
                    style={{
                      width: '100%', textAlign: 'left',
                      borderRadius: '10px', padding: '12px 14px',
                      border: `1px solid ${isActive ? 'var(--warning-border)' : 'var(--card-border)'}`,
                      backgroundColor: isActive ? 'var(--warning-bg)' : 'var(--page-bg)',
                      opacity: hasDoc ? 0.6 : 1,
                      cursor: hasDoc ? 'not-allowed' : isLocked ? 'default' : 'pointer',
                      transition: 'border-color 150ms, background-color 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '4px',
                          border: `2px solid ${isActive ? '#F5B91E' : 'var(--card-border)'}`,
                          backgroundColor: isActive ? '#F5B91E' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'all 150ms',
                        }}>
                          {isActive && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)' }}>
                          {getFiscalYearLabel(year, locale)}
                        </span>
                        {isCurrent && (
                          <span style={{
                            background: '#F5B91E', color: '#1C1A17',
                            fontSize: '10px', fontWeight: 800,
                            letterSpacing: '.06em', textTransform: 'uppercase',
                            padding: '2px 8px', borderRadius: '20px',
                          }}>
                            {tCommon('fiscalYears.current')}
                          </span>
                        )}
                      </div>
                      {hasDoc && (
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                          backgroundColor: 'var(--success-bg)', color: 'var(--success-text)',
                          border: '1px solid var(--success-border)',
                        }}>
                          {fr ? 'Documents existants' : 'Has documents'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Info banner */}
            <div style={{
              marginTop: '16px', borderRadius: '10px', padding: '12px 14px',
              display: 'flex', gap: '10px',
              background: 'var(--info-bg)', border: '1px solid var(--info-border)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p style={{ fontSize: '12px', color: 'var(--info-text)', lineHeight: 1.6 }}>
                {t('fiscalYearsCatchUpHint')}
              </p>
            </div>
          </div>

          {/* Message d'échec — même forme que la boîte info ci-dessus, jetons
              --error-* au lieu de --info-*. Les deux triplets sont adaptatifs. */}
          {saveError && (
            <div style={{
              width: '100%', marginBottom: '16px',
              borderRadius: '10px', padding: '12px 14px',
              display: 'flex', gap: '10px',
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p style={{ fontSize: '12px', color: 'var(--error-text)', lineHeight: 1.6 }}>
                {saveError}
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <button
              onClick={() => {
                // ⛔ LA SORTIE QUI COMPTE, ET AUCUNE API NE LA COUVRE. « Passer »
                //    est un `router.push` de NOTRE code : `beforeunload` ne le
                //    voit pas — c'est un changement de route, pas un
                //    déchargement. Il faut donc l'intercepter ICI, là où il est
                //    écrit.
                // ⚠️ ET CE BOUTON CHANGE DE SENS AVEC CE LOT. Son commentaire
                //    d'origine disait qu'il « mène exactement où mène Terminer ».
                //    Ce n'est plus vrai : Terminer enregistre, Passer abandonne.
                // ⛔ LA CONFIRMATION NE SORT QUE S'IL Y A QUELQUE CHOSE À PERDRE.
                //    Un avertissement qui sort toujours se fait ignorer en trois
                //    jours, et il finit par avoir l'air d'un bogue.
                //
                // ⚠️⚠️ ET SUR UNE INSCRIPTION NEUVE, IL Y A TOUJOURS QUELQUE CHOSE À
                //    PERDRE — DONC IL SORTIRA TOUJOURS. CE N'EST PAS UN BOGUE.
                //    Sans ligne enregistrée, `declarationDesExercices` rend les
                //    exercices VERROUILLÉS — l'exercice en cours et le dernier
                //    terminé —, l'écran ouvre avec eux cochés, et `storedActive` est
                //    vide : `aActiver` vaut donc ces deux-là dès le premier rendu,
                //    sans que personne ait cliqué.
                // ★ ET C'EST JUSTE, PAS UN EFFET DE BORD À CORRIGER : sauter cette
                //    étape fait réellement perdre l'exercice en cours, que rien
                //    n'aura enregistré. L'avertissement dit la vérité.
                // ⛔ NE PAS « RÉPARER » ÇA EN COMPARANT À `suivis` PLUTÔT QU'À LA
                //    BASE. `aActiver` est la liste que « Terminer » ÉCRIT : la
                //    rendre vide quand elle ne l'est pas ferait taire
                //    l'avertissement ET n'écrirait rien, ce qui est exactement
                //    l'état qu'on veut signaler.
                // ⚪ Une société qui repasse ici après avoir enregistré ne le voit
                //    PAS : `storedActive` contient alors l'exercice en cours, et
                //    `aActiver` l'exclut. Vérifié par `check:inscription`, lot D.
                //
                // ⚠️⚠️ ET LE TEXTE NOMME LE BOUTON ET LE GESTE, VOLONTAIREMENT —
                //    ne pas le « simplifier » en le croyant bavard.
                //    `window.confirm` ne rend que « OK » et « Annuler » : SES
                //    BOUTONS NE PEUVENT PAS PORTER LE REMÈDE. Une phrase qui se
                //    contenterait de dire ce qui est perdu laisserait l'utilisateur
                //    deviner quoi faire, devant deux boutons qui ne le disent pas
                //    non plus. Le texte doit donc nommer le geste MANQUANT
                //    (« Terminer ») ET ce que « continuer » fait.
                //    ⚪ Le couplage au libellé « Terminer » est ASSUMÉ : décision
                //    de Dom, 2026-09-17, ce libellé ne change pas.
                //    ⚪ ET SI CET ÉCRAN GAGNE UN JOUR UNE VRAIE MODALE avec ses
                //    propres boutons — « Revenir » / « Quitter sans enregistrer » —
                //    alors le remède vit dans les boutons, et la phrase peut
                //    redevenir courte : « … ne sont pas encore enregistrés. »
                if (!riendAEnregistrer && !window.confirm(t('unsavedFiscalYearsWarning'))) return
                router.push(`/${locale}/dashboard`)
              }}
              style={{
                fontSize: '14px', color: 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
              }}
            >
              {fr ? 'Passer' : 'Skip'}
            </button>
            <button
              onClick={handleStart}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#F5B91E', color: '#1C1A17',
                fontSize: '15px', fontWeight: 700,
                padding: '13px 32px', borderRadius: '10px',
                border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'opacity 150ms',
              }}
            >
              {saving ? (fr ? 'Chargement...' : 'Loading...') : (fr ? 'Terminer' : 'Finish')}
              {!saving && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
