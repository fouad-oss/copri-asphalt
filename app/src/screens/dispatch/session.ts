/* Dispatch-module sessions — the clerk (plant) and engineer (site) realms
   are separate from the office portal's copri_app_session. PINs are checked
   client-side against the ref_payload lists (legacy v1 posture) and NEVER
   ride a URL; only the resolved name is stored, in sessionStorage. */

export type FieldSession = { name: string; ts: number }

const CLERK_KEY = "copri_dispatch_clerk"
const ENGINEER_KEY = "copri_dispatch_engineer"

function read(key: string): FieldSession | null {
  try { return JSON.parse(sessionStorage.getItem(key) || "null") } catch { return null }
}

export function getClerkSession() { return read(CLERK_KEY) }
export function setClerkSession(name: string) {
  sessionStorage.setItem(CLERK_KEY, JSON.stringify({ name, ts: Date.now() }))
}
export function clearClerkSession() { sessionStorage.removeItem(CLERK_KEY) }

export function getEngineerSession() { return read(ENGINEER_KEY) }
export function setEngineerSession(name: string) {
  sessionStorage.setItem(ENGINEER_KEY, JSON.stringify({ name, ts: Date.now() }))
}
export function clearEngineerSession() { sessionStorage.removeItem(ENGINEER_KEY) }
