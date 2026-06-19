import { type NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  // API routes don't need GET-driven session cookie rotation; skip before any
  // Supabase work so route handlers keep full control of their own auth.
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
