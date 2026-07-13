import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ErrorBox, LoadingList } from "@/components/patterns"
import { fetchManagers, setDeskSession, type Manager } from "./lib"

/* ── Interim desk PIN gate — name + PIN validated against the
   plant_managers / finance_managers tables (0006), same posture as the
   legacy portals until Supabase Auth reaches the desks. ── */

export default function PinGate({ kind, onSuccess }: {
  kind: "plant" | "finance"; onSuccess: (name: string) => void
}) {
  const { t } = useTranslation("boards")
  const [managers, setManagers] = useState<Manager[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [wrong, setWrong] = useState(false)

  useEffect(() => {
    let live = true
    fetchManagers(kind)
      .then((m) => { if (live) m.length ? setManagers(m) : setFailed(true) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [kind])

  if (failed) return <ErrorBox message={t("pin.listError")} />
  if (!managers) return <LoadingList rows={2} />

  const submit = () => {
    const m = managers.find((x) => x.name === name)
    if (!m || m.pin !== pin) { setWrong(true); return }
    setDeskSession(kind, m.name)
    onSuccess(m.name)
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <h2 className="text-base font-semibold">{t(kind === "plant" ? "pin.plantTitle" : "pin.financeTitle")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label>{t("pin.name")}</Label>
          <Select value={name} onValueChange={(v) => { setName(v); setWrong(false) }}>
            <SelectTrigger><SelectValue placeholder={t("pin.namePick")} /></SelectTrigger>
            <SelectContent>
              {managers.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("pin.pin")}</Label>
          <Input type="password" inputMode="numeric" autoComplete="off" value={pin}
            onChange={(e) => { setPin(e.target.value); setWrong(false) }}
            onKeyDown={(e) => { if (e.key === "Enter") submit() }} />
        </div>
        {wrong && <ErrorBox message={t("pin.wrong")} />}
        <Button type="button" onClick={submit} disabled={!name || !pin}>{t("pin.enter")}</Button>
      </CardContent>
    </Card>
  )
}
