/* Receiver session — own key, own realm (separate from the office portal). */

export type CaptureSession = { name: string; ts: number }

const KEY = "copri_capture_session"

export function getCaptureSession(): CaptureSession | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null") } catch { return null }
}
export function setCaptureSession(name: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ name, ts: Date.now() } satisfies CaptureSession))
}
export function clearCaptureSession() {
  sessionStorage.removeItem(KEY)
}
