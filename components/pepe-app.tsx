"use client"

import React, { useEffect, useState } from "react"
import { StoreProvider } from "@/lib/store"
import { I18nProvider, useT } from "@/lib/i18n"
import { ToastProvider } from "@/components/toast"
import { TonProvider } from "@/components/ton-provider"
import { TopBar } from "@/components/top-bar"
import { BottomNav } from "@/components/bottom-nav"
import { DepositModal } from "@/components/deposit-modal"
import { CasesScreen } from "@/components/screens/cases-screen"
import { RocketScreen } from "@/components/screens/rocket-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { ReferralsScreen } from "@/components/screens/referrals-screen"
import { MenuScreen } from "@/components/screens/menu-screen"
import { UpgradeScreen } from "@/components/screens/upgrade-screen"
import { MaintenanceScreen } from "@/components/screens/maintenance-screen"
import { checkAdmin, loadMaintenance } from "@/lib/api-client"
import { playNavTap } from "@/lib/sound"

export type Screen = "cases" | "rocket" | "profile" | "referrals" | "menu" | "upgrade" | "spin"

const TITLE_KEYS: Partial<Record<Screen, "title.rocket" | "title.profile" | "title.referrals" | "title.menu" | "title.upgrade">> = {
  rocket: "title.rocket",
  profile: "title.profile",
  referrals: "title.referrals",
  menu: "title.menu",
}

function BannedScreen() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0a0a0a", padding:"24px", textAlign:"center" }}>
      <div style={{ fontSize:"56px", marginBottom:"16px" }}>🚫</div>
      <h1 style={{ color:"white", fontSize:"20px", fontWeight:"900", marginBottom:"8px" }}>Account Blocked</h1>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:"14px", marginBottom:"24px" }}>Your account has been blocked.<br/>Please contact support for more information.</p>
      <a href="https://t.me/Pepe_bot_support" style={{ background:"#00ff41", color:"#000", borderRadius:"12px", padding:"12px 24px", fontWeight:"900", fontSize:"14px", textDecoration:"none" }}>
        💬 Contact Support
      </a>
    </div>
  )
}

function BannedGate({ children }: { children: React.ReactNode }) {
  const [banned, setBanned] = useState<boolean>(false)
  const [checked, setChecked] = useState<boolean>(false)

  useEffect(() => {
    const initData = (window as any)?.Telegram?.WebApp?.initData || ""
    fetch("/api/check-ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then((r) => r.json())
      .then((d) => { setBanned(!!d.banned); setChecked(true) })
      .catch(() => setChecked(true))
  }, [])

  if (!checked) return <div style={{ minHeight:"100vh", background:"#0a0a0a" }} />
  if (banned) return <BannedScreen />
  return <>{children}</>
}

export function PepeApp() {
  // "checking" until we know the maintenance flag; then "blocked" (show the
  // maintenance screen for non-admins) or "open" (render the full app).
  const [gate, setGate] = useState<"checking" | "blocked" | "open">("checking")

  useEffect(() => {
    let cancelled = false
    loadMaintenance()
      .then(async (maintenanceOn) => {
        if (!maintenanceOn) {
          if (!cancelled) setGate("open")
          return
        }
        const admin = await checkAdmin()
        if (!cancelled) setGate(admin.ok ? "open" : "blocked")
      })
      .catch(() => {
        if (!cancelled) setGate("open") // fail open
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (gate === "checking") {
    return <div className="min-h-screen bg-background" />
  }

  if (gate === "blocked") {
    return <MaintenanceScreen />
  }

  return (
    <TonProvider>
      <I18nProvider>
        <StoreProvider>
          <BannedGate>
          <ToastProvider>
            <Shell />
          </ToastProvider>
          </BannedGate>
        </StoreProvider>
      </I18nProvider>
    </TonProvider>
  )
}

function Shell() {
  const [screen, setScreen] = useState<Screen>("cases")
  const [deposit, setDeposit] = useState(false)
  const { t } = useT()

  // A quiet tap whenever the user actually switches screens (no sound if
  // they tap the tab they're already on).
  function goTo(s: Screen) {
    if (s !== screen) playNavTap()
    setScreen(s)
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-[480px] overflow-x-hidden">
      <TopBar onDeposit={() => setDeposit(true)} />

      {TITLE_KEYS[screen] && screen !== "menu" && (
        <h1 className="px-4 pb-1 pt-3 text-2xl font-black tracking-tight text-glow">{t(TITLE_KEYS[screen]!)}</h1>
      )}
      {screen === "menu" && (
        <h1 className="px-4 pb-1 pt-3 text-2xl font-black tracking-tight text-glow">{t("title.menu")}</h1>
      )}

      <main>
        {screen === "cases" && <CasesScreen />}
        {screen === "rocket" && <RocketScreen />}
        {screen === "profile" && <ProfileScreen onDeposit={() => setDeposit(true)} />}
        {screen === "referrals" && <ReferralsScreen />}
        {screen === "menu" && <MenuScreen onUpgrade={() => goTo("upgrade")} />}
        {screen === "upgrade" && <UpgradeScreen onBack={() => goTo("menu")} />}
      </main>

      <BottomNav active={screen} onChange={goTo} />

      {deposit && <DepositModal onClose={() => setDeposit(false)} />}
    </div>
  )
}
