'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    active: true,
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
    active: false,
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
    active: false,
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
    active: false,
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
    active: false,
  },
];

export function DashboardShell({ locale, profile, company, children }: DashboardShellProps) {
  const router = useRouter();
  const supabase = createClient();
  const fr = locale === 'fr';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  function toggleLanguage() {
    const newLocale = locale === 'fr' ? 'en' : 'fr';
    // Update language preference
    supabase.from('users').update({ preferred_language: newLocale }).eq('id', profile.id);
    router.push(`/${newLocale}/dashboard`);
  }

  const companyName = company?.legal_name_fr ?? (fr ? "Votre entreprise" : "Your company");

  return (
    <div className="min-h-screen bg-ivory flex flex-col">
      {/* Top Nav */}
      <header className="bg-white border-b border-ivory-dark sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 md:px-6 h-16">
          {/* Left: hamburger + logo */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg text-navy-500 hover:bg-ivory transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <ZapLogo size="sm" />
            <div className="hidden md:flex items-center gap-1 text-navy-400">
              <span>/</span>
              <span className="text-sm font-medium text-navy-700 truncate max-w-[200px]">{companyName}</span>
            </div>
          </div>

          {/* Right: lang toggle + avatar */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-dark bg-ivory hover:bg-navy-50 transition-colors text-sm font-medium text-navy-700"
            >
              <span>{locale === 'fr' ? '🇨🇦' : '🇨🇦'}</span>
              <span>{locale === 'fr' ? 'EN' : 'FR'}</span>
            </button>

            <div className="relative group">
              <button className="w-8 h-8 bg-navy-900 rounded-full flex items-center justify-center text-ivory text-sm font-semibold">
                {profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </button>
              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-ivory-dark rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 py-1 z-50">
                <div className="px-3 py-2 border-b border-ivory-dark">
                  <p className="text-xs font-medium text-navy-900 truncate">{profile.full_name}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  {fr ? "Se déconnecter" : "Log out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed md:sticky top-16 left-0 h-[calc(100vh-4rem)] w-64 bg-white border-r border-ivory-dark flex flex-col transition-transform duration-200 z-30',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          )}
        >
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => (
              <div key={item.key}>
                {item.active ? (
                  <Link
                    href={`/${locale}/${item.href}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-navy-50 text-navy-900 font-medium text-sm"
                  >
                    <span className="text-navy-900">{item.icon}</span>
                    {fr ? item.labelFr : item.labelEn}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-navy-400 text-sm cursor-not-allowed opacity-60">
                    {item.icon}
                    {fr ? item.labelFr : item.labelEn}
                    <span className="ml-auto text-xs bg-ivory-dark text-navy-400 px-1.5 py-0.5 rounded-md">
                      {fr ? 'Bientôt' : 'Soon'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-ivory-dark">
            <div className="bg-ivory rounded-xl p-3">
              <p className="text-xs font-semibold text-navy-700 mb-0.5">Sprint 1</p>
              <p className="text-xs text-navy-400">
                {fr ? "Livre des minutes en configuration" : "Minute book being set up"}
              </p>
            </div>
          </div>
        </aside>

        {/* Overlay on mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-navy-900/30 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 p-6 md:p-8 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
