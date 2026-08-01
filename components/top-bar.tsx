"use client"

import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { TonIcon, PlusIcon, SoundOnIcon, SoundOffIcon } from "@/components/icons"
import { isSoundEnabled, toggleSound, playClick } from "@/lib/sound"
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react"

function truncate(addr: string) {
  if (!addr) return ""
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export function TopBar({ onDeposit }: { onDeposit: () => void }) {
  const { ton } = useStore()
  const [tonConnectUI] = useTonConnectUI()
  const address = useTonAddress()
  const [soundOn, setSoundOn] = useState(true)

  // Read the persisted preference after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setSoundOn(isSoundEnabled())
  }, [])

  function handleWallet() {
    if (address) {
      tonConnectUI.disconnect()
    } else {
      tonConnectUI.openModal()
    }
  }

  function handleToggleSound() {
    const next = toggleSound()
    setSoundOn(next)
    if (next) playClick()
  }

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between gap-2 px-4 py-3 backdrop-blur-md"
      style={{ background: "linear-gradient(180deg,rgba(5,7,10,0.92),rgba(5,7,10,0.6))" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black"
          style={{
            background: "radial-gradient(circle at 35% 25%, #39FF14, #00a52c)",
            color: "#04130a",
            boxShadow: "0 0 14px rgba(0,255,65,0.6)",
          }}
        >
          P
        </span>
        <span className="text-lg font-extrabold tracking-tight text-glow">PEPE</span>
      </div>

      <div className="flex items-center gap-2">
        {/* sound mute toggle */}
        <button
          onClick={handleToggleSound}
          aria-label={soundOn ? "Mute sound" : "Unmute sound"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: soundOn ? "#9affc0" : "#7da890",
          }}
        >
          {soundOn ? <SoundOnIcon className="h-4 w-4" /> : <SoundOffIcon className="h-4 w-4" />}
        </button>

        {/* wallet connect */}
        <button
          onClick={handleWallet}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95"
          style={{
            background: address ? "rgba(0,255,65,0.12)" : "rgba(40,160,255,0.12)",
            border: address ? "1px solid rgba(0,255,65,0.4)" : "1px solid rgba(40,160,255,0.45)",
            color: address ? "#9affc0" : "#7cc4ff",
          }}
        >
          <WalletIcon className="h-4 w-4" />
          {address ? truncate(address) : "Connect"}
        </button>

        {/* balance / deposit */}
        <button
          onClick={onDeposit}
          className="flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5"
          style={{
            background: "linear-gradient(160deg, rgba(0,255,65,0.1), rgba(5,7,10,0.85))",
            border: "1px solid rgba(0,255,65,0.35)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          <TonIcon className="h-5 w-5" />
          <span className="text-sm font-bold tabular-nums">{ton.toFixed(2)}</span>
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(180deg,#0aff45,#00a52c)", color: "#04130a" }}
          >
            <PlusIcon className="h-4 w-4" />
          </span>
        </button>
      </div>
    </header>
  )
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M21 12a2 2 0 0 0-2-2h-5a2 2 0 0 0 0 4h5a2 2 0 0 0 2-2Z" />
    </svg>
  )
}
