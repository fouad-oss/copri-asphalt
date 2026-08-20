// دفعة جديدة — generate a payment certificate from site data: for every
// WO×BOP item, uncertified balance = Σ executed (طلبات التدقيق, opening
// included) − Σ already billed in previous certificates. Balances prefill
// the quantities; the QA adjusts and saves as a draft certificate.
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { RefCode } from "@/components/patterns"
import { kd, qty as fq } from "@/lib/format"
import {
  bopItems, certifiedTotals, execTotals, itemRef, kashefList, paycertCreate, paycertList,
  type BopItem, type KashefOverview,
} from "./data"
import { locationLabel } from "./KashefList"
import { checkDate, dateInputProps } from "./dates"

interface BalanceRow {
  kashefId: number
  bopItemId: number
  item: BopItem
  balance: number
}

interface WoGroup {
  k: KashefOverview
  rows: BalanceRow[]
}

export function PayCertNew() {
  const { t } = useTranslation("quantities")
  const nav = useNavigate()
  const [groups, setGroups] = useState<WoGroup[] | undefined>()
  const [error, setError] = useState(false)
  const [certNo, setCertNo] = useState("")
  const [periodEnd, setPeriodEnd] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuwait" }))
  const [note, setNote] = useState("")
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(false)
    setGroups(undefined)
    try {
      const [wos, bop, exec, certified, certs] = await Promise.all([
        kashefList(), bopItems(), execTotals(), certifiedTotals(), paycertList(),
      ])
      const byId = new Map(bop.map((b) => [b.id, b]))
      const cert = new Map(certified.map((c) => [`${c.kashefId}/${c.bopItemId}`, c.qty]))
      const woById = new Map(wos.map((k) => [k.id, k]))
      const grouped = new Map<number, BalanceRow[]>()
      for (const e of exec) {
        const bal = e.qty - (cert.get(`${e.kashefId}/${e.bopItemId}`) ?? 0)
        const item = byId.get(e.bopItemId)
        if (bal <= 0.0005 || !item || !woById.has(e.kashefId)) continue
        const rows = grouped.get(e.kashefId) ?? []
        rows.push({ kashefId: e.kashefId, bopItemId: e.bopItemId, item, balance: bal })
        grouped.set(e.kashefId, rows)
      }
      const gs: WoGroup[] = [...grouped.entries()]
        .map(([kid, rows]) => ({
          k: woById.get(kid)!,
          rows: rows.sort((a, b) => a.item.bab - b.item.bab || a.item.band - b.item.band),
        }))
        .sort((a, b) => a.k.kashefNo - b.k.kashefNo)
      setGroups(gs)
      setQtys(Object.fromEntries(gs.flatMap((g) =>
        g.rows.map((r) => [`${r.kashefId}/${r.bopItemId}`, String(round3(r.balance))]))))
      setCertNo(String(Math.max(0, ...certs.map((c) => c.certNo)) + 1))
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])

  function round3(v: number) { return Math.round(v * 1000) / 1000 }

  const total = useMemo(() => {
    if (!groups) return 0
    return groups.reduce((s, g) => s + g.rows.reduce((x, r) => {
      const q = Number(qtys[`${r.kashefId}/${r.bopItemId}`] || 0)
      return x + (isFinite(q) && q > 0 ? q * r.item.rate : 0)
    }, 0), 0)
  }, [groups, qtys])

  function setAll(fill: boolean) {
    if (!groups) return
    setQtys(Object.fromEntries(groups.flatMap((g) => g.rows.map((r) =>
      [`${r.kashefId}/${r.bopItemId}`, fill ? String(round3(r.balance)) : "0"]))))
  }

  async function save() {
    if (!groups || busy) return
    const no = Number(certNo)
    if (!Number.isInteger(no) || no <= 0) { toast.error(t("pc.certNo")); return }
    const lines = groups.flatMap((g) => g.rows.flatMap((r) => {
      const q = Number(qtys[`${r.kashefId}/${r.bopItemId}`] || 0)
      return isFinite(q) && q > 0
        ? [{ kashefId: r.kashefId, bopItemId: r.bopItemId, qty: q }] : []
    }))
    if (lines.length === 0) { toast.error(t("pc.nothingToBill")); return }
    const dateErr = checkDate(periodEnd)
    if (dateErr) { toast.error(t(dateErr)); return }
    setBusy(true)
    try {
      const res = await paycertCreate({
        certNo: no, periodEnd: periodEnd || null, source: "site", note, lines,
      })
      toast.success(t("pc.saved"))
      nav(`/quantities/paycerts/${res.certId}`)
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
        {t("app.loadError")}{" "}
        <Button variant="outline" size="sm" className="ms-2" onClick={() => void load()}>
          {t("app.retry")}
        </Button>
      </div>
    )
  }
  if (!groups) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">{t("pc.computing")}</div>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t("pc.newTitle")}</h1>
        <Link to="/quantities/paycerts" className="ms-auto text-sm text-muted-foreground underline">
          {t("pc.back")}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{t("pc.newHint")}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <Label htmlFor="pc-no">{t("pc.certNo")}</Label>
          <Input id="pc-no" className="w-24" dir="ltr" inputMode="numeric"
                 value={certNo} onChange={(e) => setCertNo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pc-date">{t("pc.periodEnd")}</Label>
          <Input id="pc-date" className="w-40" dir="ltr" type="date"
                 value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} {...dateInputProps()} />
        </div>
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="pc-note">{t("pc.noteField")}</Label>
          <Input id="pc-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAll(false)}>{t("pc.zeroAll")}</Button>
          <Button variant="outline" size="sm" onClick={() => setAll(true)}>{t("pc.fillAll")}</Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("pc.nothingToBill")}
        </div>
      ) : groups.map((g) => (
        <section key={g.k.id} className="overflow-x-auto rounded-lg border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <span className="text-sm font-semibold">
              {t("pc.woSection")} <RefCode>{g.k.woNo || String(g.k.kashefNo)}</RefCode>
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={locationLabel(g.k, t)}>{locationLabel(g.k, t)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="w-20 px-3 py-1.5 text-start font-normal">{t("detail.col.ref")}</th>
                <th className="px-3 py-1.5 text-start font-normal">{t("detail.col.desc")}</th>
                <th className="px-3 py-1.5 text-center font-normal">{t("detail.col.unit")}</th>
                <th className="px-3 py-1.5 text-center font-normal">{t("detail.col.rate")}</th>
                <th className="px-3 py-1.5 text-center font-normal">{t("pc.balance")}</th>
                <th className="px-3 py-1.5 text-center font-normal">{t("pc.includeQty")}</th>
                <th className="px-3 py-1.5 text-end font-normal">{t("detail.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const key = `${r.kashefId}/${r.bopItemId}`
                const q = Number(qtys[key] || 0)
                const amount = isFinite(q) && q > 0 ? q * r.item.rate : 0
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-1.5"><RefCode>{itemRef(r.item)}</RefCode></td>
                    <td className="max-w-md px-3 py-1.5">{r.item.description}</td>
                    <td className="px-3 py-1.5 text-center">{r.item.unit}</td>
                    <td className="px-3 py-1.5 text-center font-mono tabular-nums" dir="ltr">{kd(r.item.rate)}</td>
                    <td className="px-3 py-1.5 text-center font-mono tabular-nums" dir="ltr">{fq(r.balance)}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Input className="mx-auto h-7 w-28 text-center text-sm" dir="ltr" inputMode="decimal"
                             value={qtys[key] ?? ""} onChange={(e) => setQtys((x) => ({ ...x, [key]: e.target.value }))} />
                    </td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums" dir="ltr">
                      {amount > 0 ? kd(amount) : <Badge variant="outline">{t("pc.excluded")}</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <span className="text-sm text-muted-foreground">{t("pc.selectedTotal")}: </span>
        <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">{kd(total)}</span>
        <Button className="ms-auto" disabled={busy || groups.length === 0} onClick={() => void save()}>
          {busy ? <Spinner className="size-4" /> : t("pc.save")}
        </Button>
      </div>
    </div>
  )
}
