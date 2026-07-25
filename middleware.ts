import { type NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  // API routes don't need GET-driven session cookie rotation; skip before any
  // Supabase work so route handlers keep full control of their own auth.
  //
  // ★ LOAD-BEARING — THIS RETURN IS WHAT KEEPS LOGIN WORKING. The matcher below
  // does NOT exclude /api (it excludes only _next/static, _next/image and
  // favicon.ico), so EVERY /api request reaches this function. This early return
  // is the ONLY thing keeping app/api/auth/callback/route.ts out of the Supabase
  // refresh path above — that route calls exchangeCodeForSession() and writes the
  // session cookies itself, and it must be the sole writer for that exchange.
  //
  // Consequences, so nobody has to rediscover them:
  //   - MOVING the auth callback out of /api/ (e.g. under /[locale]/) removes its
  //     protection and it starts running the middleware refresh — LOGIN BREAKS.
  //   - DELETING or REORDERING this return below the createServerClient block has
  //     the same effect — LOGIN BREAKS.
  //   - If the callback ever must live outside /api/, exclude it in the matcher
  //     FIRST; do not rely on this condition to cover it.
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // next-intl owns the response we ultimately return (locale rewrite/redirect
  // + NEXT_LOCALE cookie). We graft any refreshed Supabase auth cookies onto it.
  const response = intlMiddleware(request)

  // A5 — persist refresh-token rotation in the ONE place that can write cookies
  // on a GET navigation. Without this, an RSC getUser() refresh fires
  // TOKEN_REFRESHED → setAll → cookieStore.set() throws → swallowed, so the
  // rotated token never reaches the browser and the session desyncs into a
  // login→403→re-login→refetch storm. Middleware setAll CAN write, so it sticks.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Mirror onto the request so any downstream read in THIS pass sees the
          // fresh token, and onto the intl response so the browser persists it.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // On-demand refresh lives here because middleware is the only place that can
  // persist refresh-token rotation (setAll → cookies) on a GET navigation. No
  // auth GATE here — pages self-guard via redirect('/login'); a second gate
  // risks a redirect loop. Best-effort: a thrown refresh (the A5 auth-service
  // saturation signature) must NOT 500 every page — degrade to "not refreshed
  // this pass"; the page's own getUser()/redirect still gates.
  try {
    await supabase.auth.getUser()
  } catch {
    // swallow — refresh simply didn't happen this pass
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
