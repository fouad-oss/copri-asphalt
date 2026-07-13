import { createClient } from "@supabase/supabase-js"

// Same project + publishable key as the legacy app (public by design —
// RLS enforces access; every compound write is a SECURITY DEFINER RPC).
export const SUPABASE_URL = "https://abwsxqnppihrmkhydkai.supabase.co"
export const SUPABASE_ANON_KEY = "sb_publishable_4k0seyEmCwB-9oI1krpvKQ_VBDwuNgE"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/** rpc that unwraps data or throws */
export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
