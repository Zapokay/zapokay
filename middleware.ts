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
          // What each write actually achieves — the request mirror is NOT what makes
          // this work, despite appearances:
          //
          //   response.cookies.set → the BROWSER receives the rotation. This is the
          //     load-bearing write; every SUBSEQUENT request carries the fresh token.
          //
          //   request.cookies.set → does NOT reach the same-pass RSC. next-intl built
          //     `response` above via NextResponse.rewrite(url, { request: { headers } })
          //     with `new Headers(request.headers)` — a COPY snapshotted before this
          //     setAll runs (next-intl/dist/.../middleware.js, the rewrite() branch).
          //     Mutating request.cookies now cannot alter headers already copied, and
          //     Next only forwards request mutations through a response CONSTRUCTED
          //     after them. Kept because it is harmless and correct-in-intent, but do
          //     not rely on it.
          //
          // ★ SO THE SAME-PASS RSC READS THE PRE-ROTATION COOKIE and re-presents the
          // refresh token this middleware just consumed. That succeeds only because of
          // Supabase's refresh_token_reuse_interval (10s default): within the window a
          // consumed token may be re-presented and returns the same rotated session.
          // THE DESIGN DEPENDS ON THAT INTERVAL. If it is ever set to 0, the same-pass
          // RSC refresh starts failing and pages fall back to redirect('/login').
          // Fixing it properly means recomposing next-intl's response after the
          // mutation (recomputing its rewrite URL + locale header, or re-running the
          // intl middleware) — not a small change, and it lands on the login path.
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
