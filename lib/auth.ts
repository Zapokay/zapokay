import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Request-level memoization (React cache): within ONE server request, every
// caller (layout + page + nested server components) shares a single
// supabase.auth.getUser() round-trip and a single users-profile read.
//
// cache() is per-REQUEST, NOT a module-level singleton — there is no cross-
// request or cross-user leakage. This changes only HOW MANY times auth/profile
// are read per request, never WHAT is read or its freshness: the underlying
// createClient() keeps its no-store posture untouched.

export const getUser = cache(async () => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getUserWithProfile = cache(async () => {
  const user = await getUser()
  if (!user) return { user: null, profile: null }
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  return { user, profile }
})
