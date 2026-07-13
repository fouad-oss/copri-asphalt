import { useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"

/* Offline-first submission queue (v2 brief / skill CAPTURE pattern):
   every receipt is written to a localStorage queue first with a
   client-generated UUID receipt id, then a sync loop pushes it to
   Supabase — photo to the public material-receipts bucket, row to
   material_receipts (still the one direct anon insert). Idempotent:
   the receipt_id is the uniqueness key, so a duplicate-key response
   (row 23505 / storage "already exists") counts as success and a retry
   can never double-post. Sync state is visible per item and as a
   global pending badge.

   NEVER sent: approval_status / approved_by / approved_at /
   exception_note (server-forced by the 0018/0020 capture gate),
   rate / amount (retired until billing), commitment_line_id /
   no_po_flag (capture is RAW per 0020 — mapping a DN to its PO line is
   the accountant's daily batch, not a field question). */

export type SyncState = "queued" | "syncing" | "synced" | "failed"

export type MaterialReceiptRow = {
  receipt_id: string
  receiver: string
  project: string
  site: string
  work_order: string
  block: string
  street: string
  category: string
  material: string
  quantity: number | null
  unit: string
  supplier: string
  subcontractor: string
  remarks: string
}

export type QueuedReceipt = {
  receiptId: string
  row: MaterialReceiptRow
  /** compressed dataURL kept in the queue until uploaded, then dropped */
  photoData: string
  /** public URL once the upload landed (skip re-upload on retry) */
  photoUrl: string
  state: SyncState
  attempts: number
  lastError: string
  queuedAt: string
}

const KEY = "copri_capture_queue_v1"
const SYNCED_KEEP_MS = 24 * 3600e3 // synced items linger a day for display

function load(): QueuedReceipt[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]")
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

let items: QueuedReceipt[] = load()
const listeners = new Set<() => void>()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(items)) }
  catch { /* quota — the in-memory copy still syncs while the page lives */ }
}
function notify() { listeners.forEach((l) => l()) }
function commit(next: QueuedReceipt[]) { items = next; persist(); notify() }
function patch(id: string, p: Partial<QueuedReceipt>) {
  commit(items.map((i) => (i.receiptId === id ? { ...i, ...p } : i)))
}

export function getQueue(): QueuedReceipt[] { return items }
export function pendingCount(): number { return items.filter((i) => i.state !== "synced").length }

/** React binding — snapshot is the module array, replaced on every change. */
export function useQueue(): QueuedReceipt[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => items,
  )
}

/** Queue a receipt for submission and kick the sync loop. Returns instantly —
 *  the caller never waits on the network (three-tap goal). */
export function enqueueReceipt(row: MaterialReceiptRow, photoData: string) {
  const item: QueuedReceipt = {
    receiptId: row.receipt_id, row, photoData, photoUrl: "",
    state: "queued", attempts: 0, lastError: "", queuedAt: new Date().toISOString(),
  }
  commit([item, ...items])
  void syncNow()
}

/* ── The sync loop ── */

async function uploadPhoto(receiptId: string, dataUrl: string): Promise<string> {
  if (!dataUrl) return ""
  const name = `${receiptId}.jpg`
  const blob = await (await fetch(dataUrl)).blob()
  const { error } = await supabase.storage
    .from("material-receipts")
    .upload(name, blob, { contentType: blob.type || "image/jpeg" })
  // "already exists" = a previous attempt landed the photo — idempotent success
  if (error && !/exist|duplicate/i.test(String(error.message || ""))) throw error
  return supabase.storage.from("material-receipts").getPublicUrl(name).data.publicUrl
}

let syncing = false

/** Push every non-synced item, oldest first. Photo first, then the row —
 *  a row is never written without its photo (legacy invariant kept). */
export async function syncNow(): Promise<void> {
  if (syncing || typeof navigator !== "undefined" && !navigator.onLine) return
  syncing = true
  try {
    const pending = [...items].filter((i) => i.state !== "synced").reverse()
    for (const it of pending) {
      patch(it.receiptId, { state: "syncing" })
      try {
        let url = it.photoUrl
        if (!url) {
          url = await uploadPhoto(it.receiptId, it.photoData)
          patch(it.receiptId, { photoUrl: url })
        }
        const { error } = await supabase
          .from("material_receipts")
          .insert({ ...it.row, photo_url: url })
        // 23505 unique violation on receipt_id = the row already landed
        if (error && error.code !== "23505") throw error
        patch(it.receiptId, { state: "synced", photoData: "", lastError: "" })
      } catch (e: any) {
        patch(it.receiptId, {
          state: "failed",
          attempts: it.attempts + 1,
          lastError: String(e?.message || e || "error"),
        })
      }
    }
  } finally {
    syncing = false
    pruneSynced()
  }
}

function pruneSynced() {
  const cut = Date.now() - SYNCED_KEEP_MS
  const next = items.filter((i) => i.state !== "synced" || new Date(i.queuedAt).getTime() > cut)
  if (next.length !== items.length) commit(next)
}

/* Retry when the browser comes back online + a slow poll while anything is
   pending (covers transient server errors, not just connectivity). */
let started = false
export function initQueueSync() {
  if (started) return
  started = true
  window.addEventListener("online", () => { void syncNow() })
  window.setInterval(() => { if (pendingCount() > 0) void syncNow() }, 25_000)
  void syncNow()
}
