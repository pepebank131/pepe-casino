"use client"

import { CaseIcon, HomeIcon, RocketIcon, UserIcon, UsersIcon } from "@/components/icons"
import type { Screen } from "@/components/pepe-app"
import { useT, type TKey } from "@/lib/i18n"

const TABS: { id: Screen; labelKey: TKey; Icon: typeof HomeIcon }[] = [
  { id: "menu", labelKey: "nav.menu", Icon: HomeIcon },
  { id: "profile", labelKey: "nav.profile", Icon: UserIcon },
  { id: "referrals", labelKey: "nav.referrals", Icon: UsersIcon },
  { id: "rocket", labelKey: "nav.rocket", Icon: RocketIcon },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: Screen
  onChange: (s: Screen) => void
}) {
  const { t } = useT()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[480px] items-end justify-around px-3 pb-3 pt-2.5"
      style={{
        background: "linear-gradient(180deg, rgba(8,12,9,0.4), #04080a)",
        borderTop: "1px solid rgba(0,255,65,0.14)",
        boxShadow: "0 -6px 24px rgba(0,255,65,0.1)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Tab tab={TABS[0]} active={active} onChange={onChange} />
      <Tab tab={TABS[1]} active={active} onChange={onChange} />

      {/* center cases button */}
      <button
        onClick={() => onChange("cases")}
        className="-mt-7 flex flex-col items-center gap-1 active:scale-95"
        aria-label="Cases"
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 25%, #39FF14 0%, #00d437 45%, #007a20 100%)",
            border: "1.5px solid rgba(57,255,20,0.7)",
            boxShadow:
              "0 0 18px rgba(0,255,65,0.7), 0 6px 14px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.4)",
          }}
        >
          <CaseIcon className="h-7 w-7" style={{ color: "#04130a" }} />
        </span>
        <span
          className="text-[10px] font-bold"
          style={{ color: active === "cases" || active === "spin" ? "#39FF14" : "#5f8f6e" }}
        >
          {t("nav.cases")}
        </span>
      </button>

      <Tab tab={TABS[2]} active={active} onChange={onChange} />
      <Tab tab={TABS[3]} active={active} onChange={onChange} />
    </nav>
  )
}

function Tab({
  tab,
  active,
  onChange,
}: {
  tab: { id: Screen; labelKey: TKey; Icon: typeof HomeIcon }
  active: Screen
  onChange: (s: Screen) => void
}) {
  const { t } = useT()
  const isActive = active === tab.id
  const { Icon } = tab
  return (
    <button
      onClick={() => onChange(tab.id)}
      className="flex w-16 flex-col items-center gap-1 py-1 active:scale-95"
    >
      <Icon
        className="h-6 w-6 transition-all"
        style={{
          color: isActive ? "#39FF14" : "#5f8f6e",
          filter: isActive ? "drop-shadow(0 0 5px rgba(0,255,65,0.8))" : "none",
        }}
      />
      <span className="text-[10px] font-semibold" style={{ color: isActive ? "#39FF14" : "#5f8f6e" }}>
        {t(tab.labelKey)}
      </span>
    </button>
  )
}
