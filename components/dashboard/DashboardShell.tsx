'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CompanySwitcher } from '@/components/dashboard/CompanySwitcher';
import { YearPicker } from '@/components/ui/YearPicker';
import type { UserProfile, Company } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface DashboardShellProps {
  locale: string;
  profile: UserProfile;
  company: Company | null;
  children: React.ReactNode;
  urgentCount?: number;
  topbarSubtitle?: string;
  fiscalYears?: number[];
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
      {
        key: 'dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
        labelFr: 'Tableau de bord',
        labelEn: 'Dashboard',
        href: 'dashboard',
      },
      {
        key: 'directors',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        labelFr: 'Administrateurs',
        labelEn: 'Directors',
        href: 'directors',
      },
      {
        key: 'officers',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
        labelFr: 'Dirigeants',
        labelEn: 'Officers',
        href: 'officers',
      },
      {
        key: 'shareholders',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
        ),
        labelFr: 'Actionnaires',
        labelEn: 'Shareholders',
        href: 'shareholders',
      },
    ],
  },
  {
    groupKeyFr: 'DOCUMENTS',
    groupKeyEn: 'DOCUMENTS',
    items: [
      {
        key: 'documents',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        labelFr: 'Documents',
        labelEn: 'Documents',
        href: 'documents',
      },
      {
        key: 'minute-book',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
        labelFr: 'Livre de minutes',
        labelEn: 'Minute Book',
        href: 'minute-book',
      },
      {
        key: 'resolutions',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        labelFr: 'Résolutions',
        labelEn: 'Resolutions',
        href: 'wizard',
      },
    ],
  },
  {
    groupKeyFr: 'CONFORMITÉ',
    groupKeyEn: 'COMPLIANCE',
    items: [
      {
        key: 'compliance',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
        labelFr: 'Suivi',
        labelEn: 'Tracking',
        href: 'compliance',
      },
      {
        key: 'activity',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        labelFr: 'Historique',
        labelEn: 'History',
        href: 'activity',
      },
      {
        key: 'settings',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        labelFr: 'Paramètres',
        labelEn: 'Settings',
        href: 'settings',
      },
    ],
  },
];

export function DashboardShell({ locale, profile, company, children, urgentCount = 0, topbarSubtitle, fiscalYears }: DashboardShellProps) {
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
    if (pathname.includes('/dashboard/compliance')) return fr ? 'Suivi' : 'Tracking';
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
      >
        {/* Brand */}
        <div className="sb-brand">
          <span className="sb-signature">
            <span className="sig-zap">Zap</span>
            <span className="sig-okay">Okay</span>
          </span>
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
                          !isActive(item.href) && 'hover:bg-white/5'
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
                        {item.key === 'compliance' && urgentCount > 0 && (
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
              fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0,
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
              color: 'rgba(255,255,255,.40)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.70)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.40)')}
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
              <YearPicker locale={locale} years={fiscalYears} />
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
