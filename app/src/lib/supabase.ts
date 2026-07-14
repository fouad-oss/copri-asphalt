import { createClient } from "@supabase/supabase-js"

// Same project + publishable key as the legacy app (public by design —
// RLS enforces access; every compound write is a SECURITY DEFINER RPC).
export const SUPABASE_URL = "https://abwsxqnppihrmkhydkai.supabase.co"
export const SUPABASE_ANON_KEY = "sb_publishable_4k0seyEmCwB-9oI1krpvKQ_VBDwuNgE"

// Late-bound fetch: supabase-js otherwise captures the global fetch at
// client creation, which defeats request interception in browser-driven
// tests. Identical behavior in production.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: (...args) => window.fetch(...args) },
})

/** rpc that unwraps data or throws */
export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
