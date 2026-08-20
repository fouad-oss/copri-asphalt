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

/* ── PIN-gated sign-up (0070) ──
   Order matters: the anon PIN pre-check runs BEFORE auth.signUp so a bad
   or already-used PIN never creates an orphan auth account. The link
   itself is pipeline_user_link_self (0017) — once-ever per row and per
   auth account, so the PIN is one-time by construction. */

async function linkAndLoad(pin: string): Promise<Profile> {
  const l = await rpc("pipeline_user_link_self", { p_pin: pin })
  if (!l?.success) {
    await supabase.auth.signOut()
    throw new Error(l?.error === "bad pin" ? "badPin" : "pinUsed")
  }
  const r = await rpc("pipeline_login_jwt", {})
  if (!r?.success) { await supabase.auth.signOut(); throw new Error("notEnabled") }
  const p = fromRpc(r)
  setSession(p)
  return p
}

/** New auth account from PIN + email + password. Returns null when the
    project requires email confirmation first (no session yet) — the user
    confirms, then finishes via linkExisting on the same page. */
export async function signUpWithPin(email: string, password: string, pin: string): Promise<Profile | null> {
  const c = await rpc("signup_pin_check", { p_pin: pin })
  if (!c?.success) throw new Error(c?.error === "bad pin" ? "badPin" : "pinUsed")
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(/already|registered/i.test(error.message) ? "emailTaken" : "signupFailed")
  if (!data.session) return null
  return linkAndLoad(pin)
}

/** Existing (dashboard-created or just-confirmed) auth account + one-time
    PIN link — the path loginEmail refuses with notLinked. */
export async function linkExisting(email: string, password: string, pin: string): Promise<Profile> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error("badCreds")
  return linkAndLoad(pin)
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
