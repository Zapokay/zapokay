/**
 * ZapOkay — Duotone Icon System (Aria v2)
 *
 * Every icon: 24×24 viewBox, stroke-based.
 * Duotone = filled background at 15% opacity + crisp stroke at full opacity.
 * Both layers use `currentColor` so they adapt to any theme via parent color.
 *
 * Usage:
 *   <DuotoneHome className="text-[var(--sb-text)]" />          // inactive sidebar
 *   <DuotoneHome className="text-[var(--sb-text-active)]" />    // active sidebar
 */

import React from 'react'

interface IconProps {
  className?: string
  size?: number
  style?: React.CSSProperties
}

// ─── SIDEBAR NAV ICONS ───────────────────────────────────────

export function DuotoneHome({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 12l9-8 9 8v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8z" fill="currentColor" opacity="0.15" />
      <path d="M3 12l9-8 9 8v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneUsers({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="7" r="4" fill="currentColor" opacity="0.15" />
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneBriefcase({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotonePieChart({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21.21 15.89A10 10 0 118 2.83" fill="currentColor" opacity="0.15" />
      <path d="M21.21 15.89A10 10 0 118 2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 12A10 10 0 0012 2v10z" fill="currentColor" opacity="0.15" />
      <path d="M22 12A10 10 0 0012 2v10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneFileText({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor" opacity="0.15" />
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function DuotoneBookOpen({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" fill="currentColor" opacity="0.15" />
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" fill="currentColor" opacity="0.15" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneFilePen({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor" opacity="0.15" />
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18l4-4-2-2-4 4v2h2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneClipboardCheck({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="18" rx="2" fill="currentColor" opacity="0.15" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 14l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneClock({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneSettings({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── ONBOARDING ICONS ────────────────────────────────────────

export function DuotoneGlobe({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function DuotoneBuilding({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9" y1="6" x2="9" y2="6.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="6" x2="15" y2="6.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="10" x2="9" y2="10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="10" x2="15" y2="10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="14" x2="9" y2="14.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="14" x2="15" y2="14.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 22v-4h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotonePin({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" fill="currentColor" opacity="0.15" />
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function DuotonePeople({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="7" r="4" fill="currentColor" opacity="0.15" />
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function DuotoneChart({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.15" />
      <rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" opacity="0.15" />
      <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" opacity="0.15" />
      <rect x="3" y="12" width="4" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="8" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="17" y="3" width="4" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function DuotoneTie({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2l3 4-3 14-3-14 3-4z" fill="currentColor" opacity="0.15" />
      <path d="M12 2l3 4-3 14-3-14 3-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function DuotoneClipboard({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="18" rx="2" fill="currentColor" opacity="0.15" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function DuotoneCalendar({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// ─── UTILITY ICONS ───────────────────────────────────────────

export function DuotoneInfo({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12.01" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DuotoneZap({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" opacity="0.15" />
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneFleurDeLis({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3c0 0-2 3-2 6s2 4 2 4 2-1 2-4-2-6-2-6z" fill="currentColor" opacity="0.15" />
      <path d="M12 3c0 0-2 3-2 6s2 4 2 4 2-1 2-4-2-6-2-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 8C5 10.5 6 13 8 14c-3 .5-5 3-4.5 5h5L12 21l3.5-2h5c.5-2-1.5-4.5-4.5-5 2-1 3-3.5 1.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DuotoneMapleLeaf({ className = '', size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2l1.5 5.5L17 6l-1 4 4 1-3.5 2.5L19 17H14l-2 5-2-5H5l2.5-3.5L4 11l4-1-1-4 3.5 1.5z" fill="currentColor" opacity="0.15" />
      <path d="M12 2l1.5 5.5L17 6l-1 4 4 1-3.5 2.5L19 17H14l-2 5-2-5H5l2.5-3.5L4 11l4-1-1-4 3.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── CHECKMARK for progress bar ──────────────────────────────

export function Checkmark({ className = '', size = 13 }: IconProps) {
  return (
    <svg width={size} height={Math.round(size * 10 / 13)} viewBox="0 0 14 11" fill="none" className={className}>
      <path
        d="M1 5.5L5 9.5L13 1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── ICON MAP (for dynamic lookups) ──────────────────────────

export const iconMap = {
  home: DuotoneHome,
  users: DuotoneUsers,
  briefcase: DuotoneBriefcase,
  'pie-chart': DuotonePieChart,
  'file-text': DuotoneFileText,
  'book-open': DuotoneBookOpen,
  'file-pen': DuotoneFilePen,
  'clipboard-check': DuotoneClipboardCheck,
  clock: DuotoneClock,
  settings: DuotoneSettings,
  globe: DuotoneGlobe,
  building: DuotoneBuilding,
  pin: DuotonePin,
  people: DuotonePeople,
  chart: DuotoneChart,
  tie: DuotoneTie,
  clipboard: DuotoneClipboard,
  calendar: DuotoneCalendar,
  info: DuotoneInfo,
  zap: DuotoneZap,
  'fleur-de-lis': DuotoneFleurDeLis,
  'maple-leaf': DuotoneMapleLeaf,
  checkmark: Checkmark,
} as const

export type IconName = keyof typeof iconMap
