import { Outlet, useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import SubNav from "@/components/SubNav"
import type { Profile } from "@/lib/session"

/* Section shells: role-scoped sub-tabs + nested outlet (user context
   passes through so leaf screens keep using useOutletContext<Profile>). */

function Section({ items }: { items: { to: string; label: string; show?: boolean }[] }) {
  const user = useOutletContext<Profile>()
  return (
    <>
      <SubNav items={items.filter((i) => i.show !== false)} />
      <Outlet context={user} />
    </>
  )
}

export function ApprovalsSection() {
  const { t } = useTranslation()
  const u = useOutletContext<Profile>()
  const canDecide = u.approver || u.financeApprover || u.admin
  return <Section items={[
    { to: "/approvals", label: t("tabs.batch"), show: u.accountant },
    { to: "/approvals/requests", label: t("tabs.requests"), show: canDecide },
  ]} />
}

export function CommitmentsSection() {
  const { t } = useTranslation()
  const u = useOutletContext<Profile>()
  return <Section items={[
    { to: "/commitments", label: t("tabs.register") },
    { to: "/commitments/blankets", label: t("tabs.blankets") },
    { to: "/commitments/subs", label: t("tabs.subs") },
    { to: "/commitments/new", label: t("tabs.newRequest"), show: u.requester || u.accountant },
    { to: "/commitments/manual", label: t("tabs.manualPo"), show: u.requester },
  ]} />
}

export function DeliveriesSection() {
  const { t } = useTranslation()
  const u = useOutletContext<Profile>()
  return <Section items={[
    { to: "/deliveries", label: t("tabs.exceptions") },
    { to: "/deliveries/grn", label: t("tabs.grn"), show: u.requester },
  ]} />
}

export function MastersSection() {
  const { t } = useTranslation()
  return <Section items={[
    { to: "/masters", label: t("tabs.vendors") },
    { to: "/masters/items", label: t("tabs.items") },
    { to: "/masters/ccs", label: t("tabs.ccs") },
  ]} />
}

export function ReportsSection() {
  const { t } = useTranslation()
  const u = useOutletContext<Profile>()
  return <Section items={[
    { to: "/reports", label: t("tabs.sync") },
    { to: "/reports/recharge", label: t("tabs.recharge"), show: u.approver || u.admin },
  ]} />
}
