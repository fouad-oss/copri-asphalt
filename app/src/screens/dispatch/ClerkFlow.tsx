/* Clerk flow — PIN gate → company select → project select → dispatch form
   → success. Same step machine the legacy router ran on /dispatch, held as
   component state (no step leaks into the URL; PINs never do either). */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useDispatchRef } from "./reference"
import type { Company } from "./reference"
import type { DispatchData } from "./helpers"
import { getClerkSession, setClerkSession, clearClerkSession } from "./session"
import { InfoBox, PinScreen, PortalShell, SectionTitle } from "./components"
import DispatchForm from "./DispatchForm"
import type { DispatchCtx } from "./DispatchForm"
import DispatchSuccess from "./DispatchSuccess"

export default function ClerkFlow() {
  const { t } = useTranslation("dispatch")
  const { cfg } = useDispatchRef()
  const [clerk, setClerk] = useState<string | null>(() => getClerkSession()?.name ?? null)
  const [pickedCompany, setPickedCompany] = useState<{ name: string; company: Company } | null>(null)
  const [ctx, setCtx] = useState<DispatchCtx | null>(null)
  const [done, setDone] = useState<{ data: DispatchData; receiptLink: string | null } | null>(null)
  const [formEpoch, setFormEpoch] = useState(0)   // remount = fresh idempotency ref

  function logout() {
    clearClerkSession()
    setClerk(null); setPickedCompany(null); setCtx(null); setDone(null)
  }
  function backToCompanies() {
    setPickedCompany(null); setCtx(null); setDone(null)
    setFormEpoch((n) => n + 1)
  }

  if (!clerk) {
    return (
      <PortalShell badge={t("badge.clerkLogin")}>
        <PinScreen title={t("pin.clerkTitle")} people={cfg.clerks}
          onSuccess={(name) => { setClerkSession(name); setClerk(name) }} />
      </PortalShell>
    )
  }

  if (done && ctx) {
    return (
      <PortalShell badge={t("badge.dispatch")}>
        <DispatchSuccess
          isCopri={!!ctx.company.isCopri}
          data={done.data}
          receiptLink={done.receiptLink}
          onNew={() => { setDone(null); setFormEpoch((n) => n + 1) }}
          onChangeProject={backToCompanies}
          onLogout={logout}
        />
      </PortalShell>
    )
  }

  if (ctx) {
    return (
      <PortalShell badge={t("badge.dispatch")}>
        <DispatchForm key={formEpoch} ctx={ctx} clerkName={clerk}
          onChangeProject={backToCompanies}
          onSuccess={(data, receiptLink) => setDone({ data, receiptLink })} />
      </PortalShell>
    )
  }

  // Step 2 — pick the PROJECT within the chosen company.
  if (pickedCompany) {
    const { name: companyName, company } = pickedCompany
    return (
      <PortalShell badge={t("badge.project")}>
        <Card><CardContent className="flex flex-col gap-3 px-4 py-4">
          <SectionTitle>{t("project.title", { company: companyName })}</SectionTitle>
          <InfoBox>{t("project.hint")}</InfoBox>
          {Object.entries(company.projects).map(([name, proj]) => (
            <button key={name} type="button"
              onClick={() => setCtx({ companyName, company, projectName: name, project: proj })}
              className="rounded-lg border bg-card px-4 py-3 text-start hover:border-primary">
              <div className="font-semibold">{name}</div>
              {proj.contract && <div className="text-sm text-muted-foreground"><bdi dir="rtl">{proj.contract}</bdi></div>}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setPickedCompany(null)}>{t("project.back")}</Button>
        </CardContent></Card>
      </PortalShell>
    )
  }

  // Step 1 — pick the receiving COMPANY (Copri = full flow with site receipt;
  // others END AT THE PLANT: dispatch recorded, no engineer step).
  return (
    <PortalShell badge={t("badge.company")}>
      <Card><CardContent className="flex flex-col gap-3 px-4 py-4">
        <SectionTitle>{t("company.title")}</SectionTitle>
        <InfoBox>{t("company.hint")}</InfoBox>
        {Object.entries(cfg.companies).map(([name, company]) => (
          <button key={name} type="button"
            onClick={() => setPickedCompany({ name, company })}
            className="rounded-lg border bg-card px-4 py-3 text-start hover:border-primary">
            <div className="font-semibold">{name}</div>
            <div className="text-sm text-muted-foreground">
              {company.isCopri ? t("company.copri") : t("company.plantOnly")}
              {" · "}
              {t("company.projects", { n: Object.keys(company.projects || {}).length })}
            </div>
          </button>
        ))}
      </CardContent></Card>
    </PortalShell>
  )
}
