'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  UserCheck,
  Briefcase,
  PieChart,
  FileText,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronsUpDown,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// Nav item type
// =============================================================================

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

// =============================================================================
// Nav structure (matches brief exactly)
// =============================================================================

function getNavGroups(locale: string): NavGroup[] {
  const base = `/${locale}/dashboard`;

  return [
    {
      labelKey: 'nav.group.company',
      items: [
        { key: 'nav.dashboard', href: base, icon: LayoutDashboard },
        { key: 'nav.directors', href: `${base}/directors`, icon: UserCheck },
        { key: 'nav.officers', href: `${base}/officers`, icon: Briefcase },
        { key: 'nav.shareholders', href: `${base}/shareholders`, icon: PieChart },
      ],
    },
    {
      labelKey: 'nav.group.documents',
      items: [
        { key: 'nav.documents', href: `${base}/documents`, icon: FileText },
        { key: 'nav.minuteBook', href: `${base}/minute-book`, icon: BookOpen },
        { key: 'nav.resolutions', href: `${base}/resolutions`, icon: Sparkles },
      ],
    },
    {
      labelKey: 'nav.group.compliance',
      items: [
        { key: 'nav.compliance', href: `${base}/compliance`, icon: ShieldCheck },
      ],
    },
  ];
}

// =============================================================================
// Sidebar component
// =============================================================================

interface SidebarProps {
  /** Company name for the company switcher */
  companyName?: string;
  /** User display name */
  userName?: string;
  /** User email */
  userEmail?: string;
  /** Callback for sign-out */
  onSignOut?: () => void;
  /** Callback for company switcher click */
  onSwitchCompany?: () => void;
  /** Whether sidebar is open on mobile */
  isOpen?: boolean;
  /** Close sidebar on mobile */
  onClose?: () => void;
}

export default function Sidebar({
  companyName = 'Mon entreprise',
  userName = '',
  userEmail = '',
  onSignOut,
  onSwitchCompany,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();

  const navGroups = getNavGroups(locale);
  const settingsHref = `/${locale}/dashboard/settings`;

  // Active check: exact match for dashboard root, startsWith for sub-pages
  function isActive(href: string): boolean {
    if (href === `/${locale}/dashboard`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Mobile overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ════════════════════════════════════════════════════════════════════
           Zone A — Signature / Brand
           ════════════════════════════════════════════════════════════════════ */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-100 px-5 dark:border-zinc-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Zap<span className="text-amber-500">Okay</span>
          </span>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
           Zone B — Company switcher
           ════════════════════════════════════════════════════════════════════ */}
        <button
          type="button"
          onClick={onSwitchCompany}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {companyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {companyName}
            </p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>

        {/* ════════════════════════════════════════════════════════════════════
           Zone C — Navigation
           ════════════════════════════════════════════════════════════════════ */}
        <nav className="mt-4 flex-1 overflow-y-auto px-3">
          {navGroups.map((group, gi) => (
            <div key={group.labelKey} className={gi > 0 ? 'mt-6' : ''}>
              {/* Group label */}
              <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {t(group.labelKey)}
              </p>

              {/* Items */}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Divider ── */}
          <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />

          {/* ── Paramètres (standalone, after divider) ── */}
          <Link
            href={settingsHref}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive(settingsHref)
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Settings
              className={`h-4 w-4 shrink-0 ${
                isActive(settingsHref)
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            />
            {t('nav.settings')}
          </Link>
        </nav>

        {/* ════════════════════════════════════════════════════════════════════
           Zone D — User profile
           ════════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 border-t border-zinc-100 px-3 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {userName
                ? userName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : '?'}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              {userName && (
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {userName}
                </p>
              )}
              {userEmail && (
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {userEmail}
                </p>
              )}
            </div>

            {/* Sign out */}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title={t('nav.signOut')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

