import { supabase, rpc } from "@/lib/supabase"

export type Profile = {
  name: string
  pin: string
  requester: boolean
  approver: boolean
  accountant: boolean
  admin: boolean
  financeApprover: boolean
  management: boolean
  costCenterId: number | null
}

const KEY = "copri_app_session"

export function getSession(): Profile | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null") } catch { return null }
}
export function setSession(p: Profile | null) {
  if (p) sessionStorage.setItem(KEY, JSON.stringify(p))
  else sessionStorage.removeItem(KEY)
}

function fromRpc(r: any, pin = ""): Profile {
  return {
    name: r.name, pin,
    requester: !!r.requester, approver: !!r.approver,
    accountant: !!r.accountant, admin: !!r.admin,
    financeApprover: !!r.financeApprover, management: !!r.management,
    costCenterId: r.costCenterId ?? null,
  }
}

/** Email + password via Supabase Auth, then the pipeline profile. */
export async function loginEmail(email: string, password: string): Promise<Profile> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { const e = new Error("badCreds"); throw e }
  const r = await rpc("pipeline_login_jwt", {})
  if (!r?.success) {
    await supabase.auth.signOut()
    throw new Error(r?.notLinked ? "notLinked" : "notEnabled")
  }
  const p = fromRpc(r)
  setSession(p)
  return p
}

/** Interim PIN login — the server refuses it once auth_required flips. */
export async function loginPin(pin: string): Promise<Profile> {
  const r = await rpc("pipeline_user_check", { p_pin: pin })
  if (!r?.success) throw new Error(r?.authRequired ? "pinRetired" : "badPin")
  const p = fromRpc(r, pin)
  setSession(p)
  return p
}

export async function logout() {
  setSession(null)
  try { await supabase.auth.signOut() } catch { /* ignore */ }
}
