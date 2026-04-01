'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ZapLogo } from '@/components/ui/ZapLogo';
import type { UserProfile, Company } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface DashboardShellProps {
  locale: string;
  profile: UserProfile;
  company: Company | null;
  children: React.ReactNode;
  urgentCount?: number;
}

const navItems = [
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
    comingSoon: false,
  },
  {
    key: 'compliance',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    labelFr: 'Conformité',
    labelEn: 'Compliance',
    href: 'compliance',
    comingSoon: false,
  },
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
    comingSoon: false,
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
    href: 'resolutions',
    comingSoon: true,
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
    comingSoon: true,
  },
];

export function DashboardShell({ locale, profile, company, children, urgentCount = 0 }: DashboardShellProps) {
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
    if (pathname.includes('/dashboard/compliance')) return fr ? 'Conformité' : 'Compliance';
    if (pathname.includes('/dashboard/resolutions')) return fr ? 'Résolutions' : 'Resolutions';
    if (pathname.includes('/dashboard/settings')) return fr ? 'Paramètres' : 'Settings';
    return fr ? 'Tableau de bord' : 'Dashboard';
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  const companyName = company?.legal_name_fr ?? (fr ? 'Votre entreprise' : 'Your company');
  const companyInitials = ((company?.legal_name_fr ?? '').trim().slice(0, 2).toUpperCase()) || 'ZO';
  const initials = profile.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'DR';
  const displayType = company?.incorporation_type === 'LSA' ? 'LSAQ' : company?.incorporation_type;
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
        {/* Logo */}
        <div
          className="px-4 pt-5 pb-3"
          style={{ '--wordmark-color': 'var(--sb-wordmark)', '--logo-sq': 'var(--neutral-0)', '--logo-z': 'var(--navy-900)' } as React.CSSProperties}
        >
          <ZapLogo size="sm" variant="wordmark" />
        </div>

        {/* Company selector */}
        <div style={{
          background: 'var(--sb-co-bg)',
          border: '1px solid var(--sb-co-border)',
          borderRadius: '10px',
          padding: '10px 12px',
          margin: '0 12px 8px',
        }}>
          <div style={{ fontSize: '9px', color: 'var(--sb-co-label)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
            ENTREPRISE ACTIVE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Avatar initiales entreprise */}
            <div style={{
              width: '40px', height: '40px', borderRadius: '8px',
              background: 'var(--navy-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700,
              color: '#FFFFFF', flexShrink: 0, letterSpacing: '0.02em',
            }}>
              {companyInitials}
            </div>
            <div>
              <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '13px', fontWeight: 700, color: 'var(--sb-co-name)' }}>
                {company?.legal_name_fr ?? 'Mon entreprise'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--sb-co-label)', marginTop: '2px' }}>
                {displayType} · {company?.province}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
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
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Topbar — does NOT span over sidebar */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-[var(--tb-border)]"
          style={{ background: 'var(--tb-bg)' }}
        >
          {/* Left: hamburger (mobile) + title */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--page-bg)] transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '17px', fontWeight: 700, color: 'var(--tb-title)' }}>
                {getPageTitle()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {companyName}
              </div>
            </div>
          </div>

          {/* Right: search + CTA + lang toggle */}
          <div className="flex items-center gap-3">

            <input
              type="text"
              placeholder={fr ? 'Rechercher...' : 'Search...'}
              className="hidden md:block w-48 px-3 py-1.5 rounded-lg text-sm text-[var(--text-body)] placeholder:text-[var(--text-muted)] border border-[var(--tb-border)] outline-none focus:border-[var(--input-border-focus)]"
              style={{ background: 'var(--tb-search-bg)' }}
            />

            <button className="bg-[var(--amber-400)] text-[var(--navy-900)] font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[var(--spark-400)] transition-colors whitespace-nowrap">
              ⚡ {fr ? 'Nouvelle résolution' : 'New resolution'}
            </button>
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
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
