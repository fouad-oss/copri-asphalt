import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { qty as fmtQty } from "@/lib/format"
import { AuditBadge } from "./AuditQueue"
import { L } from "./labels"
import {
  kwDateTime, noteDetail,
  type AsphaltNoteDetail, type Channel, type MaterialNoteDetail, type NoteDetailData,
} from "./data"
import { LoadError } from "./ui"

/* ── Screen 1b: Note detail — the clickable audit row ─────────────────
   ALL the information, both sides: the clerk's dispatch entry and the
   site's receipt entries (asphalt), or the full capture + approval
   state (materials). The not-received panel names the engineer the
   receipt link went to — that name comes from the clerk's entry.
   Values render exactly as stored (Arabic master data stays Arabic). ── */

type Field = [string, React.ReactNode]

function FieldCard({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{title}</div>
      <dl>
        {fields.map(([label, value], i) => (
          <div key={`${label}-${i}`} className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="text-end font-medium"><bdi dir="auto">{value ?? "—"}</bdi></dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—")
const num = (v: number | null | undefined) => (v == null ? "—" : fmtQty(v))

function NotReceivedPanel({ engineer }: { engineer: string }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-surface p-3 text-sm">
      <div className="font-semibold text-warning">{L.note.notReceivedTitle}</div>
      <div className="mt-1">
        {engineer.trim()
          ? L.note.notReceivedLink(engineer)
          : L.note.notReceivedNoEng}
      </div>
    </div>
  )
}

function BundleCard({ d }: { d: NoteDetailData }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{L.note.bundleTitle}</div>
      {d.bundles.length === 0 ? (
        <span className="text-muted-foreground">{L.note.notBundled}</span>
      ) : (
        <div className="flex flex-wrap gap-3">
          {d.bundles.map((b) => (
            <Link key={b.id} to={`/accounting/bundles/${b.id}`}
              className="underline-offset-2 hover:underline">
              <RefCode>{b.bundleNo}</RefCode>
              <span className="ms-1 text-xs text-muted-foreground">
                ({b.status}{b.isAdjustment ? ` · ${L.note.adjustment}` : ""})
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AsphaltDetail({ d }: { d: AsphaltNoteDetail }) {
  const dispatchFields: Field[] = [
    [L.note.fDispatchedAt, <span key="ts" className="tabular-nums">{kwDateTime(d.ts)}</span>],
    [L.note.fLoadNo, d.loadNumber ?? "—"],
    [L.note.fCompany, dash(d.company)],
    [L.note.fProject, dash(d.project)],
    [L.note.fContract, dash(d.contract)],
    [L.note.fWo, dash(d.workOrder === "*" ? "" : d.workOrder)],
    [L.note.fPlant, dash(d.plant)],
    [L.note.fMix, dash(d.mix)],
    [L.note.fWeight, num(d.weight)],
    [L.note.fTemp, num(d.tempDispatch)],
    [L.note.fTruck, dash(d.truck)],
    [L.note.fDriver, dash(d.driver)],
    [L.note.fDriverPhone, dash(d.driverPhone)],
    [L.note.fNaqel, dash(d.naqel)],
    [L.note.fSite, dash(d.site)],
    [L.note.fBlock, dash(d.block)],
    [L.note.fStreet, dash(d.street)],
    [L.note.fLocType, dash(d.locType)],
    [L.note.fClerk, dash(d.clerk)],
    [L.note.fNotify, dash(d.notifyEngineer)],
    [L.note.fStatus, dash(d.status)],
    [L.note.fRemarks, dash(d.remarks)],
  ]
  if (d.isMisc) dispatchFields.push([L.note.fMisc, L.note.yes])
  if (d.followupFlag) dispatchFields.push([L.note.fFollowup, L.note.yes])

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FieldCard title={L.note.dispatchCard} fields={dispatchFields} />
      <div className="flex flex-col gap-3">
        {d.receipts.length === 0 && <NotReceivedPanel engineer={d.notifyEngineer} />}
        {d.receipts.length > 1 && (
          <p className="text-xs text-muted-foreground">{L.note.multiReceipts}</p>
        )}
        {d.receipts.map((r) => (
          <FieldCard key={r.id} title={L.note.receiptCard} fields={[
            [L.note.rReceivedAt, <span key="ts" className="tabular-nums">{kwDateTime(r.ts)}</span>],
            [L.note.rEngineer, dash(r.engineer)],
            [L.note.rDecision, dash(r.decision)],
            [L.note.rWeight, num(r.weightArrival)],
            [L.note.rTemp, num(r.tempArrival)],
            [L.note.rWo, dash(r.workOrder === "*" ? "" : r.workOrder)],
            [L.note.rRemarks, dash(r.remarks)],
          ]} />
        ))}
      </div>
    </div>
  )
}

function MaterialDetail({ d }: { d: MaterialNoteDetail }) {
  const captureFields: Field[] = [
    [L.note.mCapturedAt, <span key="ts" className="tabular-nums">{kwDateTime(d.ts)}</span>],
    [L.note.mReceiver, dash(d.receiver)],
    [L.note.fProject, dash(d.project)],
    [L.note.fSite, dash(d.site)],
    [L.note.fBlock, dash(d.block)],
    [L.note.fStreet, dash(d.street)],
    [L.note.fWo, dash(d.workOrder)],
    [L.note.mCategory, dash(d.category)],
    [L.note.mMaterial, dash(d.material)],
    [L.note.mQty, num(d.quantity)],
    [L.note.mUnit, dash(d.unit)],
    [L.note.mSupplier, dash(d.supplier)],
    [L.note.mSubcontractor, dash(d.subcontractor)],
    [L.note.fRemarks, dash(d.remarks)],
  ]
  const acctFields: Field[] = [
    [L.note.aApproval, dash(d.approvalStatus)],
    [L.note.aApprovedBy, dash(d.approvedBy)],
    [L.note.aApprovedAt, d.approvedAt
      ? <span key="ts" className="tabular-nums">{kwDateTime(d.approvedAt)}</span> : "—"],
  ]
  if (d.noPoFlag) acctFields.push([L.note.aNoPo, L.note.yes])
  if (d.exceptionNote.trim()) acctFields.push([L.note.aException, d.exceptionNote])

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FieldCard title={L.note.captureCard} fields={captureFields} />
      <div className="flex flex-col gap-3">
        <FieldCard title={L.note.accountingCard} fields={acctFields} />
        {d.photoUrl && (
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{L.note.mPhoto}</div>
            <a href={d.photoUrl} target="_blank" rel="noreferrer" className="block">
              <img src={d.photoUrl} alt={L.note.mPhoto}
                className="max-h-64 rounded-md border object-contain" loading="lazy" />
              <span className="mt-1 block text-xs text-muted-foreground underline-offset-2 hover:underline">
                {L.note.mOpenPhoto}
              </span>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NoteDetail() {
  const { channel: chParam, ref } = useParams()
  const channel: Channel = chParam === "materials" ? "materials" : "asphalt"
  const [d, setD] = useState<NoteDetailData | null | undefined>(undefined)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false); setD(undefined)
    try { setD(await noteDetail(channel, Number(ref))) } catch { setError(true) }
  }, [channel, ref])
  useEffect(() => { void load() }, [load])

  const backTo = channel === "materials" ? "/accounting?ch=materials" : "/accounting"

  if (error) return <LoadError onRetry={() => void load()} />
  if (d === undefined) return <Skeleton className="h-64 w-full rounded-lg" />
  if (d === null) return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {L.note.notFound}
      <div className="mt-2"><Link className="underline" to={backTo}>{L.note.back}</Link></div>
    </div>
  )

  const noteNo = d.channel === "asphalt" ? d.note : d.receiptId

  return (
    <div className="flex flex-col gap-3" dir="ltr">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">
          {d.channel === "asphalt" ? L.note.headingAsphalt : L.note.headingMaterial}{" "}
          <RefCode>{noteNo}</RefCode>
        </h2>
        <AuditBadge channel={channel} status={d.reconStatus} />
        <div className="flex-1" />
        <Link to={backTo} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          {L.note.back}
        </Link>
      </div>

      {d.channel === "asphalt" ? <AsphaltDetail d={d} /> : <MaterialDetail d={d} />}

      <BundleCard d={d} />
    </div>
  )
}
