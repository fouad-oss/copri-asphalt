import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { L } from "./labels"
import type { Channel } from "./data"

/* ── Shared accounting UI primitives ──────────────────────────────────
   English-only versions of the recurring blocks (the shared patterns.tsx
   equivalents render i18next strings, which must not leak into these
   screens). One copy each — the screens compose them. ── */

export function ChannelTabs({ channel, onChange }: { channel: Channel; onChange: (ch: Channel) => void }) {
  return (
    <div className="flex gap-1 border-b pb-2">
      {(["asphalt", "materials"] as Channel[]).map((ch) => (
        <button key={ch} type="button" onClick={() => onChange(ch)}
          className={cn(
            "rounded-md px-3 py-1 text-sm",
            channel === ch ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
          )}>
          {L.tabs[ch]}
        </button>
      ))}
    </div>
  )
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
      {L.app.loadError}
      <Button variant="outline" size="sm" className="ms-3" onClick={onRetry}>{L.app.retry}</Button>
    </div>
  )
}

export function Loading({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-9 w-full rounded-md", className)} />
      ))}
    </div>
  )
}

export function EmptyCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1">{hint}</div>}
    </div>
  )
}

/** Object-URL download with a deferred revoke — revoking synchronously
 *  after click() can abort the fetch in Firefox/Safari. */
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

/** Stale-response guard: `const done = seq(ref); …await…; if (!done()) return`
 *  keeps an out-of-order response from landing in state after the user
 *  switched channel or filters (worst case: GRN numbers minted against
 *  the wrong channel's note ids). */
export function seq(ref: { current: number }): () => boolean {
  const mine = ++ref.current
  return () => ref.current === mine
}
