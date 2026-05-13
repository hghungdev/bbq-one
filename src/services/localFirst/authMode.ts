import { supabase } from '@/services/supabase'

/**
 * Check if user is authenticated (has active Supabase session).
 * Used by all dual-mode services to decide where to read/write.
 * Supabase caches the session internally — không gây extra network request.
 */
export async function isAuthenticated(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return false
  return !!data.session
}

/** Get current user id, throwing if not logged in */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw error
  const id = session?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}
