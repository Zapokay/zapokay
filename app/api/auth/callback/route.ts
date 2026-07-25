import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'

type Locale = (typeof routing.locales)[number]

/**
 * UI locale for this route's redirects, from the `?locale=` param both callers
 * already append to `emailRedirectTo` (LoginForm signInWithOtp, SignupForm signUp).
 *
 * WHY THE PARAM and not the NEXT_LOCALE cookie: this route's redirects have to be
 * right on the FAILURE path above all, and the param is strongest exactly there —
 * it rides the URL the user clicked, so it survives an expired link, an
 * already-consumed link, and a missing session. The cookie is WEAKEST there: magic
 * links are frequently opened in a different browser or device from the one that
 * requested them (request on a laptop, open the mail on a phone), and that browser
 * may carry no ZapOkay cookie at all.
 *
 * ★ THE ALLOWLIST IS SECURITY, NOT TIDINESS. `locale` is attacker-controlled and is
 * interpolated into a redirect path below; interpolating it raw is an open-redirect
 * / path-injection shape. Anything not in routing.locales falls back to
 * routing.defaultLocale, so 'evil.com', '../../etc' and '' can never reach the URL.
 */
function resolveLocale(requested: string | null): Locale {
  return routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Resolved ONCE, used by both redirects — success and failure must agree.
  const lang = resolveLocale(searchParams.get('locale'))

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // `preferred_language` is deliberately NOT selected here any more. It used to
        // pick the redirect locale (`profile?.preferred_language ?? 'fr'`), which
        // violated the Two-Layer Language Model locked in CLAUDE.md §3: UI locale is
        // URL-based, `preferred_language` is a per-user stored value used for DOCUMENT
        // generation, and the two are independent. Coupling them dropped a user whose
        // documents are French but who works in English into /fr/dashboard after every
        // magic-link login. Only `onboarding_completed` is needed — it drives the
        // DESTINATION (dashboard vs onboarding), which is unchanged.
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single()

        const destination = profile?.onboarding_completed ? 'dashboard' : 'onboarding'
        return NextResponse.redirect(`${origin}/${lang}/${destination}`)
      }
    }
  }

  // Failure — reached by FOUR paths: no `code` param, exchangeCodeForSession error,
  // no user returned, and the profile lookup falling through. All four now honour the
  // caller's locale instead of the former hardcoded 'fr'.
  return NextResponse.redirect(`${origin}/${lang}/login?error=auth`)
}
