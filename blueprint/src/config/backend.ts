// Same Supabase project as the main Copri app. The publishable anon key
// is public by design (it ships in the main app's index.html); RLS is
// what protects the data.
export const SUPABASE_URL = 'https://abwsxqnppihrmkhydkai.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_4k0seyEmCwB-9oI1krpvKQ_VBDwuNgE'

export async function sbGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`db read ${res.status}`)
  return res.json()
}
