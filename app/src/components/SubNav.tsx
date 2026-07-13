import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

/** Section sub-navigation: URL-backed pill tabs. */
export default function SubNav({ items }: { items: { to: string; label: string }[] }) {
  if (items.length < 2) return null
  return (
    <div className="mb-3 flex flex-wrap gap-1 border-b pb-2">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end
          className={({ isActive }) => cn(
            "rounded-md px-3 py-1 text-sm",
            isActive ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
          )}>
          {it.label}
        </NavLink>
      ))}
    </div>
  )
}
