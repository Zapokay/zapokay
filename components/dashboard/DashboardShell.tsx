'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CompanySwitcher } from '@/components/dashboard/CompanySwitcher';
import LanguageToggle from '@/components/ui/LanguageToggle';
import type { UserProfile, Company } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  DuotoneHome, DuotoneUsers, DuotoneBriefcase, DuotonePieChart,
  DuotoneFileText, DuotoneBookOpen,
  DuotoneClipboardCheck, DuotoneClock, DuotoneSettings,
} from '@/components/icons/DuotoneIcons';

interface DashboardShellProps {
  locale: string;
  profile: UserProfile;
  company: Company | null;
  children: React.ReactNode;
  urgentCount?: number;
  topbarSubtitle?: string;
}

type NavItem = {
  key: string;
  icon: React.ReactNode;
  labelFr: string;
  labelEn: string;
  href: string;
  comingSoon?: boolean;
};

type NavGroup = {
  groupKeyFr: string;
  groupKeyEn: string;
  items: NavItem[];
};

// FR/EN inline: matches existing DashboardShell sidebar pattern.
// Full sidebar i18n migration to useTranslations() tracked separately.
const navGroups: NavGroup[] = [
  {
    groupKeyFr: 'ENTREPRISE',
    groupKeyEn: 'COMPANY',
    items: [
      { key: 'dashboard',    icon: <DuotoneHome />,         labelFr: 'Tableau de bord', labelEn: 'Dashboard',    href: 'dashboard' },
      { key: 'directors',    icon: <DuotoneUsers />,        labelFr: 'Administrateurs', labelEn: 'Directors',    href: 'directors' },
      { key: 'officers',     icon: <DuotoneBriefcase />,    labelFr: 'Dirigeants',      labelEn: 'Officers',     href: 'officers' },
      { key: 'shareholders', icon: <DuotonePieChart />,     labelFr: 'Actionnaires',    labelEn: 'Shareholders', href: 'shareholders' },
    ],
  },
  {
    groupKeyFr: 'LIVRE DE MINUTES',
    groupKeyEn: 'MINUTE BOOK',
    items: [
      { key: 'documents',    icon: <DuotoneFileText />,        labelFr: 'Documents',  labelEn: 'Documents',    href: 'minute-book/documents' },
      { key: 'completeness', icon: <DuotoneClipboardCheck />,  labelFr: 'Complétude', labelEn: 'Completeness', href: 'minute-book/completeness' },
      { key: 'binder',       icon: <DuotoneBookOpen />,        labelFr: 'Livre',      labelEn: 'Binder',       href: 'minute-book/binder' },
    ],
  },
  {
    groupKeyFr: 'COMPTE',
    groupKeyEn: 'ACCOUNT',
    items: [
      { key: 'activity',    icon: <DuotoneClock />,          labelFr: 'Historique',  labelEn: 'History',  href: 'activity' },
      { key: 'settings',    icon: <DuotoneSettings />,       labelFr: 'Paramètres',  labelEn: 'Settings', href: 'settings' },
    ],
  },
];

export function DashboardShell({ locale, profile, company, children, urgentCount = 0, topbarSubtitle }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const fr = locale === 'fr';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function isActive(href: string) {
    if (href === 'dashboard') {
      return pathname.endsWith('/dashboard');
    }
    return pathname.includes(`/dashboard/${href}`);
  }

  function getPageTitle() {
    if (pathname.includes('/dashboard/minute-book/documents'))    return fr ? 'Documents'  : 'Documents';
    if (pathname.includes('/dashboard/minute-book/completeness')) return fr ? 'Complétude' : 'Completeness';
    if (pathname.includes('/dashboard/minute-book/binder'))       return fr ? 'Livre'      : 'Binder';
    if (pathname.includes('/dashboard/settings')) return fr ? 'Paramètres' : 'Settings';
    if (pathname.includes('/dashboard/directors')) return fr ? 'Administrateurs' : 'Directors';
    if (pathname.includes('/dashboard/officers')) return fr ? 'Dirigeants' : 'Officers';
    if (pathname.includes('/dashboard/shareholders')) return fr ? 'Actionnaires' : 'Shareholders';
    if (pathname.includes('/dashboard/activity')) return fr ? 'Historique' : 'History';
    return fr ? 'Tableau de bord' : 'Dashboard';
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  const initials = profile.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'DR';

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--page-bg)]">

      {/* Sidebar — full height, in-flow on desktop, fixed on mobile */}
      <aside
        className={cn(
          'w-[240px] flex-shrink-0 flex flex-col h-full bg-[var(--sb-bg)] z-30 transition-transform duration-200',
          'fixed md:relative',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{ borderRight: '1px solid var(--sb-border)' }}
      >
        {/* Brand */}
        <div className="sb-brand">
          <span className="sb-signature">
            <span className="sig-zap">Zap</span>
            <span style={{ color: 'var(--sb-wordmark)' }}>Okay</span>
          </span>
        </div>

        {/* "Entreprise active" label */}
        <div
          className="px-4 pt-4 pb-1.5 text-[9px] font-bold tracking-[.12em] uppercase"
          style={{ color: 'var(--sb-group-label)' }}
        >
          {fr ? 'Entreprise active' : 'Active company'}
        </div>

        {/* Company switcher */}
        <CompanySwitcher company={company} locale={locale} />

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {/* Group label */}
              <div
                className="px-3 py-1 text-[10px] font-bold tracking-widest"
                style={{ color: 'var(--sb-group-label)' }}
              >
                {fr ? group.groupKeyFr : group.groupKeyEn}
              </div>
              <div className="space-y-0.5 mt-1">
                {group.items.map(item => (
                  <div key={item.key}>
                    {!item.comingSoon ? (
                      /**
                       * ⭐ LE PRÉCHARGEMENT EST RALLUMÉ — DOM, 2026-09-19,
                       *   lot T. Et il l'est pour la RAISON ÉCRITE
                       *   D'AVANCE, pas pour une autre : le coût d'un point
                       *   d'entrée a baissé.
                       *
                       * ══════════════════════════════════════════════════════
                       * ⛔ CE FICHIER A ÉTÉ COUPÉ DEUX FOIS. LIS L'HISTOIRE
                       *   AVANT DE LE RETOUCHER, ELLE TIENT EN QUATRE
                       *   DATES.
                       * ══════════════════════════════════════════════════════
                       *   · 2026-09-18 (`bad0ed2`) COUPÉ. Huit requêtes
                       *     serveur par affichage, 533 ms à 1,08 s chacune
                       *     — les neuf entrées de cette barre moins la page
                       *     courante.
                       *   · 2026-09-19 (`f1a4945`) RALLUMÉ, à tort : un
                       *     `loading.tsx` venait d'être posé et on a cru
                       *     que la frontière suffirait.
                       *   · 2026-09-19 (`d8bb4b5`) RECOUPÉ le même jour. Le
                       *     seuil était écrit d'avance, quatre appels le
                       *     franchissaient, dont un à 1,06 s.
                       *   · 2026-09-19 (ce commit) RALLUMÉ. Voir pourquoi
                       *     c'est différent.
                       *
                       * ★★ POURQUOI LA PREMIÈRE TENTATIVE A ÉCHOUÉ — ET
                       *   C'EST CE QUI A ÉTÉ RÉPARÉ DEPUIS. La
                       *   documentation de Next 14 dit « ONLY THE SHARED
                       *   LAYOUT, down the rendered tree of components
                       *   until the first `loading.js` file, is prefetched
                       *   ». Le `loading.tsx` faisait donc bien son travail
                       *   — il retirait la PAGE — mais il gardait le
                       *   LAYOUT, qui portait presque tout le coût. Borner
                       *   la descente ne pouvait pas rendre le
                       *   préchargement bon marché tant que le layout
                       *   coûtait quatre allers-retours sérialisés vers
                       *   Montréal.
                       *
                       * ⭐ CE QUE CHAQUE PRÉCHARGEMENT PAIE MAINTENANT, ET
                       *   C'EST LA CONDITION SATISFAITE :
                       *   · lot Q — le middleware appelait `getUser()` pour
                       *     un résultat qu'il jetait ; `getSession()` ne
                       *     touche pas le réseau. −1
                       *   · lot R — le rendu vérifie le jeton LOCALEMENT
                       *     (`getClaims()` + un cache de JWKS au niveau du
                       *     module). −1
                       *   · lot S — profil et société partaient en FILE ;
                       *     elles partent ensemble. 2 vagues → 1
                       *   ⇒ QUATRE allers-retours sérialisés deviennent UNE
                       *     vague de deux requêtes parallèles.
                       *
                       * ⚠️ ET LA CONDITION ÉTAIT DOUBLE — LA SECONDE MOITIÉ
                       *   N'EST PAS ENCORE SATISFAITE, ELLE EST MISE À
                       *   L'ÉPREUVE PAR CE COMMIT. La note précédente
                       *   exigeait « une EXPLICATION mesurée de l'écart,
                       *   PUIS une cascade qui montre les huit appels sous
                       *   500 ms ». L'explication est acquise ; la cascade
                       *   est ce que ce lot va chercher. ⛔ Ce n'est donc
                       *   pas une victoire déclarée, c'est un essai armé.
                       *
                       * ⛔ CE QUI NE JUSTIFIE PAS DE ROUVRIR, ET QUI RESTE
                       *   FAUX : la seule existence d'un `loading.tsx`. Ça
                       *   a été essayé le 2026-09-19 et ça a échoué en
                       *   production. Si quelqu'un recoupe cette ligne
                       *   demain, la rouvrir exigera À NOUVEAU une baisse
                       *   MESURÉE du coût d'un point d'entrée — pas un
                       *   fichier de plus dans l'arborescence.
                       *
                       * ══════════════════════════════════════════════════════
                       * ⛔⛔ LES DEUX SEUILS QUI DÉFONT CE COMMIT, POSÉS
                       *   AVANT DE REGARDER
                       * ══════════════════════════════════════════════════════
                       *   ① UN SEUL appel de préchargement au-dessus de 500
                       *     ms ⇒ on recoupe. Repère de la tentative
                       *     précédente : 364 ms à 1,06 s.
                       *   ② ⭐ ET LE VRAI, celui qui manquait la première
                       *     fois : LE DOCUMENT NE DOIT PAS REMONTER. Repère
                       *     575 ms, mesuré par Dom après le lot S (1,11 s
                       *     avant). Huit préchargements bon marché restent
                       *     huit préchargements : au-dessus de ~700 ms sur
                       *     le document, on recoupe aussi.
                       *   ⛔ Pas d'ajustement, pas de « c'est presque bon ».
                       *     Le but n'est pas que les préchargements soient
                       *     rapides, c'est que la PAGE ne ralentisse pas.
                       *
                       * ⛔ AUCUNE SONDE NE PEUT COUVRIR CECI : Next ne
                       *   précharge qu'en production. La caméra de Dom est
                       *   la seule preuve, et elle rend DEUX chiffres — un
                       *   appel de préchargement, et le document.
                       *
                       * ⚪ CE QUE DOM PERD SI ON RECOUPE, DIT PLUTÔT QUE TU.
                       *   La documentation de Next 14 ne décrit AUCUN
                       *   préchargement au survol pour l'App Router —
                       *   seulement « Routes are automatically prefetched
                       *   as they become visible in the user's viewport ».
                       *   ⛔ Ne pas affirmer que le survol subsiste : ce
                       *   n'est pas écrit, et je ne l'ai pas mesuré.
                       */
                      <Link
                        href={item.href === 'dashboard' ? `/${locale}/dashboard` : `/${locale}/dashboard/${item.href}`}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline',
                          !isActive(item.href) && 'hover:bg-[var(--sb-item-hover)]'
                        )}
                        style={
                          isActive(item.href)
                            ? { background: 'var(--sb-item-active)', color: 'var(--sb-label-active)', textDecoration: 'none' }
                            : { color: 'var(--sb-label-default)', textDecoration: 'none' }
                        }
                      >
                        <span style={{ color: isActive(item.href) ? 'var(--sb-icon-active)' : 'var(--sb-icon-default)' }}>
                          {item.icon}
                        </span>
                        <span className="flex-1">{fr ? item.labelFr : item.labelEn}</span>
                        {item.key === 'completeness' && urgentCount > 0 && (
                          <span
                            className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                            style={{ backgroundColor: '#C9A5A5', color: '#6B1E1E' }}
                          >
                            {urgentCount}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-not-allowed opacity-60"
                        style={{ color: 'var(--sb-label-default)' }}
                      >
                        <span style={{ color: 'var(--sb-icon-default)' }}>{item.icon}</span>
                        {fr ? item.labelFr : item.labelEn}
                        <span className="ml-auto text-xs px-1.5 py-0.5 rounded-md" style={{ color: 'var(--sb-group-label)' }}>
                          {fr ? 'Bientôt' : 'Soon'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ borderTop: '1px solid var(--sb-footer-border)', padding: '12px', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'var(--sb-user-avatar-bg)',
              border: '1px solid var(--sb-user-avatar-bd)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: 'var(--sb-user-avatar-text)', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sb-user-name)' }}>
                {profile.full_name ?? (fr ? 'Utilisateur' : 'User')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--sb-user-role)' }}>
                {fr ? 'Propriétaire · Plan Pro' : 'Owner · Pro plan'}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push(`/${locale}/login`);
            }}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--sb-user-role)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--sb-user-name)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--sb-user-role)')}
          >
            {fr ? '→ Déconnexion' : '→ Sign out'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[var(--navy-900)]/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="main-area flex-1">

        {/* Topbar */}
        <div className="topbar">
          <div className="flex items-center gap-3">
            {/* Hamburger mobile */}
            <button
              className="md:hidden p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--page-bg)] transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="topbar-left">
              <h1 className="page-title">{getPageTitle()}</h1>
              {topbarSubtitle && <p className="page-subtitle">{topbarSubtitle}</p>}
            </div>
          </div>

          {/*
            ⛔ LE SÉLECTEUR D'EXERCICE A QUITTÉ CETTE BARRE — DÉCISION DE DOM,
            2026-09-19, ET C'EST UN PRÉALABLE D'ARCHITECTURE, PAS UN GOÛT.

            ★ LE FAIT QUI L'A DÉCIDÉ : sur les NEUF pages qui montent cette
            coquille, UNE SEULE lui passait `fiscalYears` —
            `minute-book/documents`. Le sélecteur n'apparaissait donc que là,
            piloté par une prop que la coquille ne pouvait pas deviner.

            ⛔ ET C'EST CE QUI BLOQUAIT LA MIGRATION EN LAYOUT. Un layout ne
            reçoit RIEN de sa page : il n'aurait pas pu savoir qu'il devait
            afficher ce sélecteur. Tant qu'il vivait ici, la coquille ne pouvait
            pas devenir un `layout.tsx` — et sans layout, pas de `loading.tsx`,
            et sans `loading.tsx`, le préchargement reste coupé (voir le
            commentaire du `<Link>` plus haut). Une prop d'une page sur neuf
            tenait toute cette chaîne.

            ⚪ ET SA PLACE DÉFINITIVE EST UNE QUESTION DE DESIGN, PAS
            D'ARCHITECTURE — pour Aria. Ce lot le SORT de la coquille ; il ne
            prétend pas avoir trouvé son bon endroit. Il est rendu en tête du
            contenu de sa page, ce qui est un choix de moindre surprise, pas un
            choix étudié.
          */}
          <div className="topbar-right">
            <LanguageToggle />
          </div>
        </div>

        {/* Page content */}
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}
