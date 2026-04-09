'use client'

import { useEffect, useCallback } from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
  /** User's saved preference from Supabase (users.preferred_theme) */
  userPreferredTheme?: 'light' | 'dark' | null
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
}

function getOSPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children, userPreferredTheme }: ThemeProviderProps) {
  const resolveTheme = useCallback((): 'light' | 'dark' => {
    // If user has a saved preference (and it's not the old "original"), use it
    if (userPreferredTheme && userPreferredTheme !== ('original' as string)) {
      return userPreferredTheme
    }
    // Otherwise fallback to OS preference
    return getOSPreference()
  }, [userPreferredTheme])

  useEffect(() => {
    applyTheme(resolveTheme())

    // Listen for OS theme changes (only matters when no saved preference)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (!userPreferredTheme || userPreferredTheme === ('original' as string)) {
        applyTheme(mq.matches ? 'dark' : 'light')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [resolveTheme, userPreferredTheme])

  return <>{children}</>
}

/**
 * Toggle theme programmatically (for Settings page).
 * After calling this, persist the new value to Supabase users.preferred_theme.
 */
export function toggleTheme(): 'light' | 'dark' {
  const current = document.documentElement.getAttribute('data-theme')
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

/**
 * Get current applied theme.
 */
export function getCurrentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
}
