import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { ErrorBox, LoadingList } from "@/components/patterns"
import { copriProjectNames, useRef_ } from "./lib"

/* ── Board picker — one tile per unit board (legacy _dashHome). ── */

function Tile({ to, name, desc }: { to: string; name: string; desc: string }) {
  return (
    <Link to={to} className="rounded-lg border bg-card p-3 hover:bg-secondary/40">
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
    </Link>
  )
}

export default function HomeBoard() {
  const { t } = useTranslation("boards")
  const { data: ref, error, retry } = useRef_()

  if (error) return <ErrorBox message={t("error")} onRetry={retry} />
  if (!ref) return <LoadingList />
  const projects = copriProjectNames(ref)

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("home.pick")}</p>
        <Tile to="/boards/exec" name={t("home.exec")} desc={t("home.execDesc")} />
        <Tile to="/boards/plant" name={t("home.plant")} desc={t("home.plantDesc")} />
        {projects.map((pn) => (
          <Tile key={pn} to={`/boards/project/${encodeURIComponent(pn)}`} name={pn} desc={t("home.projectDesc")} />
        ))}
        {projects.map((pn) => (
          <Tile key={"a" + pn} to={`/boards/acct/${encodeURIComponent(pn)}`}
            name={t("home.acctPrefix") + pn} desc={t("home.acctDesc")} />
        ))}
        <p className="mt-2 text-center text-xs text-muted-foreground">{t("home.millingSoon")}</p>
      </CardContent>
    </Card>
  )
}
