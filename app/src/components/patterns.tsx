import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { statusKey } from "@/lib/i18n"
import { ageDays } from "@/lib/format"
import { cn } from "@/lib/utils"

/* ── Shared pattern primitives (copri-frontend-SKILL §the six patterns).
   Status is a small tinted badge; warnings/exceptions are the ONLY
   colored surfaces; progress is thin twin bars; queues show why + age. ── */

const STATUS_TONE: Record<string, string> = {
  "قيد المراجعة": "bg-warning-surface text-warning",
  "بانتظار": "bg-warning-surface text-warning",
  "مسودة": "bg-warning-surface text-warning",
  "معتمد": "bg-success/10 text-success",
  "نشط": "bg-success/10 text-success",
  "صادر": "bg-success/10 text-success",
  "مرفوض": "bg-danger-surface text-danger",
  "استثناء": "bg-danger-surface text-danger",
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation()
  const tone = (status && STATUS_TONE[status]) || "bg-secondary text-muted-foreground"
  return <Badge variant="secondary" className={cn("font-normal", tone)}>{status ? t(statusKey(status)) : "—"}</Badge>
}

/** Reference codes: always monospace, always LTR, isolated inside Arabic text. */
export function RefCode({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi className={cn("ref-code font-semibold", className)} dir="ltr">{children}</bdi>
}

function pct(part: number, whole: number) {
  if (!whole) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}

/** Thin twin bars where two measures exist against one total (received / invoiced). */
export function TwinBars({ total, a, b }: { total: number; a: number; b: number }) {
  return (
    <div className="flex w-full flex-col gap-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-info" style={{ width: `${pct(a, total)}%` }} />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct(b, total)}%` }} />
      </div>
    </div>
  )
}

export function Bar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const p = pct(value, max)
  const tone = danger || p >= 90 ? "bg-danger" : p >= 70 ? "bg-warning" : "bg-success"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${p}%` }} />
    </div>
  )
}

/** DETAIL pattern: metric strip — 3-4 tiles, the exceptional one tinted. */
export function MetricStrip({ tiles }: {
  tiles: { label: string; value: ReactNode; tone?: "warning" | "danger" | "success" }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((tl, i) => (
        <div key={i} className={cn(
          "rounded-lg border bg-card p-3",
          tl.tone === "warning" && "border-warning/40 bg-warning-surface",
          tl.tone === "danger" && "border-danger/40 bg-danger-surface",
          tl.tone === "success" && "border-success/30 bg-success/5",
        )}>
          <div className="text-xs text-muted-foreground">{tl.label}</div>
          <div className="mt-1 text-sm font-semibold tabular-nums">{tl.value}</div>
        </div>
      ))}
    </div>
  )}

/** QUEUE header: items waiting for the viewer + oldest-age indicator. */
export function QueueHeader({ title, count, oldestTs }: { title: string; count: number; oldestTs?: string | null }) {
  const { t } = useTranslation()
  const days = ageDays(oldestTs)
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{title} <span className="text-muted-foreground">({count})</span></h2>
      {count > 0 && days > 0 && (
        <span className="text-xs text-warning">{t("queue.oldest", { days })}</span>
      )}
    </div>
  )
}

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {hint && <EmptyDescription>{hint}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-surface p-3 text-sm text-danger">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ms-2 underline">{t("common.retry")}</button>
      )}
    </div>
  )
}
