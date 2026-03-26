import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

function getLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/')
  if (segments[1] === 'fr' || segments[1] === 'en') return segments[1]
  return 'fr'
}

function stripLocale(pathname: string): string {
  const locale = getLocaleFromPathname(pathname)
  return pathname.startsWith(`/${locale}`)
    ? pathname.slice(`/${locale}`.length) || '/'
    : pathname
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const locale = getLocaleFromPathname(pathname)
  const path = stripLocale(pathname)

  const isProtected = path.startsWith('/dashboard') || path.startsWith('/onboarding')
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/signup')

  // Always refresh Supabase session
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated user trying to access protected routes
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/login`
    return NextResponse.redirect(url)
  }

  // Authenticated user trying to access auth routes
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname = profile?.onboarding_complete
      ? `/${locale}/dashboard`
      : `/${locale}/onboarding`
    return NextResponse.redirect(url)
  }

  // Authenticated user on dashboard — check onboarding
  if (user && path.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()

    if (!profile?.onboarding_complete) {
      const url = request.nextUrl.clone()
      url.pathname = `/${locale}/onboarding`
      return NextResponse.redirect(url)
    }
  }

  // Apply i18n middleware and merge cookies
  const intlResponse = intlMiddleware(request)
  response.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value)
  })

  return intlResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
