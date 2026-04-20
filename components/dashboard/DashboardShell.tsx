'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CompanySwitcher } from '@/components/dashboard/CompanySwitcher';
import { YearPicker } from '@/components/ui/YearPicker';
import type { UserProfile, Company } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  DuotoneHome, DuotoneUsers, DuotoneBriefcase, DuotonePieChart,
  DuotoneFileText, DuotoneBookOpen, DuotoneFilePen,
  DuotoneClipboardCheck, DuotoneClock, DuotoneSettings,
} from '@/components/icons/DuotoneIcons';

interface DashboardShellProps {
  locale: string;
  profile: UserProfile;
  company: Company | null;
  children: React.ReactNode;
  urgentCount?: number;
  topbarSubtitle?: string;
  fiscalYears?: number[];
  yearPickerIncludeFoundational?: boolean;
  yearPickerIncludeUnclassified?: boolean;
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
    groupKeyFr: 'DOCUMENTS',
    groupKeyEn: 'DOCUMENTS',
    items: [
      { key: 'documents',   icon: <DuotoneFileText />,      labelFr: 'Documents',        labelEn: 'Documents',    href: 'documents' },
      { key: 'minute-book', icon: <DuotoneBookOpen />,      labelFr: 'Livre de minutes', labelEn: 'Minute Book',  href: 'minute-book' },
      { key: 'resolutions', icon: <DuotoneFilePen />,       labelFr: 'Résolutions',      labelEn: 'Resolutions',  href: 'wizard' },
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

export function DashboardShell({ locale, profile, company, children, urgentCount = 0, topbarSubtitle, fiscalYears, yearPickerIncludeFoundational, yearPickerIncludeUnclassified }: DashboardShellProps) {
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
    if (pathname.includes('/dashboard/documents')) return fr ? 'Documents' : 'Documents';
    if (pathname.includes('/dashboard/minute-book')) return fr ? 'Livre de minutes' : 'Minute Book';
    if (pathname.includes('/dashboard/wizard')) return fr ? 'Résolutions' : 'Resolutions';
    if (pathname.includes('/dashboard/resolutions')) return fr ? 'Résolutions' : 'Resolutions';
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
  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const otherLabel = locale === 'fr' ? 'EN' : 'FR';

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
                        {item.key === 'minute-book' && urgentCount > 0 && (
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
                {profile.full_name ?? 'Utilisateur'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--sb-user-role)' }}>
                Propriétaire · Plan Pro
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

          {/* Right: search + YearPicker (compliance/documents only) + CTA conditionnel + lang toggle */}
          <div className="topbar-right">
            <input
              type="text"
              placeholder={fr ? 'Rechercher...' : 'Search...'}
              className="hidden md:block w-48 px-3 py-1.5 rounded-lg text-sm text-[var(--text-body)] placeholder:text-[var(--text-muted)] border border-[var(--tb-border)] outline-none focus:border-[var(--input-border-focus)]"
              style={{ background: 'var(--tb-search-bg)' }}
            />

            {fiscalYears !== undefined && fiscalYears.length > 0 && (
              <YearPicker
                locale={locale}
                years={fiscalYears}
                includeFoundationalOption={yearPickerIncludeFoundational}
                includeUnclassifiedOption={yearPickerIncludeUnclassified}
              />
            )}

            {!pathname.includes('/compliance') && !pathname.includes('/wizard') && !pathname.includes('/settings') && !pathname.includes('/directors') && !pathname.includes('/officers') && !pathname.includes('/shareholders') && !pathname.includes('/minute-book') && (
              <button className="bg-[var(--amber-400)] text-[var(--navy-900)] font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[var(--spark-400)] transition-colors whitespace-nowrap">
                {pathname.includes('/documents')
                  ? `⚡ ${fr ? 'Ajouter' : 'Add'}`
                  : `⚡ ${fr ? 'Nouvelle résolution' : 'New resolution'}`}
              </button>
            )}

            <button
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors bg-transparent border-none cursor-pointer"
              onClick={() => {
                supabase.from('users').update({ preferred_language: otherLocale }).eq('id', profile.id);
                const newPath = pathname.replace(`/${locale}/`, `/${otherLocale}/`);
                router.replace(newPath);
              }}
            >
              {otherLabel}
            </button>
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
