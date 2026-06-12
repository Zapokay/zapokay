import { createClient } from '@supabase/supabase-js'

/**
 * #164 — Single service-role (admin) client factory.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env (the same
 * pair every prior inline `createClient(url, key)` site used). The global.fetch
 * wrapper tags every request `no-store` so Next.js's on-disk Data Cache never
 * serves stale corporate reads (force-dynamic was demonstrated insufficient —
 * #164). Wrapping ONLY this client's fetch leaves external fetches untouched.
 *
 * No auth/persistSession options — matches the prior inline call sites EXACTLY
 * (they passed nothing), so consolidation is behavior-identical apart from the
 * intended cache fix. Callers keep their own env-presence guards (they 500
 * before ever reaching here when the service key is absent).
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )
}
