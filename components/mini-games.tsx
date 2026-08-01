"use client"

import { useState, useEffect } from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/components/toast"
import { useT } from "@/lib/i18n"
import { TonIcon, ChevronLeftIcon } from "@/components/icons"
import { loadGlobalRtp, isTelegram } from "@/lib/api-client"
import { playClick, playError, playWhoosh, playLand, playWin, playLose } from "@/lib/sound"

export function CoinFlipSheet({ onClose }: { onClose: () => void }) {
  const { ton, spendTon, addTon } = useStore()
  const toast = useToast()
  const { t } = useT()
  const [bet, setBet] = useState("1")
  const [side, setSide] = useState<"pepe" | "ton">("pepe")
  const [flipping, setFlipping] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [rtp, setRtp] = useState(97)

  useEffect(() => {
    let active = true
    loadGlobalRtp()
      .then((value) => active && setRtp(Math.max(1, Math.min(99, Math.round(value)))))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  function play() {
    if (flipping) return
    if (isTelegram()) {
      playError()
      return toast("Coin flip is demo-only — real bets run server-side games only", "error")
    }
    const n = Number.parseFloat(bet)
    if (!n || n <= 0) { playError(); return toast(t("rocket.betValid"), "error") }
    if (n < 0.1) { playError(); return toast(t("common.minBet"), "error") }
    if (!spendTon(n)) { playError(); return toast(t("cases.notEnough"), "error") }
    setFlipping(true)
    playWhoosh()
    const playerWins = Math.random() < rtp / 196
    const result: "pepe" | "ton" = playerWins ? side : side === "pepe" ? "ton" : "pepe"

    // Pepe faces the viewer at rotation%360===0, TON at ===180.
    // Always spin forward several full turns, then land on the result face.
    const base = rotation - (rotation % 360)
    const targetFace = result === "pepe" ? 0 : 180
    const next = base + 360 * 6 + targetFace
    setRotation(next)

    setTimeout(() => {
      setFlipping(false)
      playLand()
      if (result === side) {
        const win = Math.round(n * 1.96 * 100) / 100
        addTon(win)
        playWin()
        toast(t("coin.won", { side: t(`coin.${result}`), n: win }), "win")
      } else {
        playLose()
        toast(t("coin.lost", { side: t(`coin.${result}`), n }), "error")
      }
    }, 2600)
  }

  return (
    <Sheet title={t("coin.title")} ton={ton} onClose={onClose}>
      <div className="flex flex-col items-center py-2">
        <Coin3D rotation={rotation} flipping={flipping} />

        <div className="mb-4 grid w-full grid-cols-2 gap-3">
          {(["pepe", "ton"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSide(s); playClick() }}
              disabled={flipping}
              className="rounded-xl py-3 text-sm font-extrabold uppercase transition active:scale-95 disabled:opacity-60"
              style={{
                background: side === s ? (s === "pepe" ? "var(--pepe)" : "var(--ton)") : "rgba(255,255,255,0.05)",
                color: side === s ? "#04130a" : "#eafff0",
                border: `1px solid ${side === s ? "transparent" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {t(`coin.${s}`)}
            </button>
          ))}
        </div>

        <BetInput bet={bet} setBet={setBet} />
        <button onClick={play} disabled={flipping} className="btn-3d mt-4 w-full rounded-2xl py-4 text-base font-extrabold disabled:opacity-70">
          {flipping ? t("coin.flipping") : t("coin.flip", { n: bet || "0" })}
        </button>
      </div>
    </Sheet>
  )
}

// A genuine 3D coin: two faces plus a stack of thin slabs forming a metallic
// edge, rotated on the X axis so it tumbles edge-over-edge toward the viewer.
function Coin3D({ rotation, flipping }: { rotation: number; flipping: boolean }) {
  const SIZE = 128
  const THICKNESS = 16
  const EDGE_SLABS = 14

  return (
    <div className="mb-6 flex h-40 items-center justify-center" style={{ perspective: "900px" }}>
      <div
        className="relative"
        style={{
          width: SIZE,
          height: SIZE,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotation}deg)`,
          transition: flipping
            ? "transform 2.6s cubic-bezier(0.2, 0.7, 0.2, 1)"
            : "transform 0.4s ease-out",
        }}
      >
        {/* edge: stacked slabs between the two faces */}
        {Array.from({ length: EDGE_SLABS }).map((_, i) => {
          const z = -THICKNESS / 2 + (THICKNESS / (EDGE_SLABS - 1)) * i
          return (
            <div
              key={i}
              className="absolute inset-0 rounded-full"
              style={{
                transform: `translateZ(${z}px)`,
                background: "linear-gradient(90deg, #6b5200, #d4af00 30%, #fff3b0 50%, #d4af00 70%, #6b5200)",
                boxShadow: "inset 0 0 12px rgba(0,0,0,0.45)",
              }}
            />
          )
        })}

        {/* PEPE face (front) */}
        <CoinFace
          z={THICKNESS / 2}
          label="P"
          gradient="radial-gradient(circle at 35% 30%, #39FF14, #00892a)"
          ring="#0aff45"
          color="#04130a"
        />
        {/* TON face (back) — flipped 180deg so it reads correctly when shown */}
        <CoinFace
          z={THICKNESS / 2}
          back
          gradient="radial-gradient(circle at 35% 30%, #36b9ff, #0066b3)"
          ring="#36b9ff"
          color="#021420"
        >
          <TonIcon className="h-14 w-14" />
        </CoinFace>
      </div>
    </div>
  )
}

function BetInput({ bet, setBet }: { bet: string; setBet: (v: string) => void }) {
  const { t } = useT()
  return (
    <div className="w-full">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {t("rocket.bet")}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,255,65,0.28)] bg-black/50 px-3 py-2.5">
        <TonIcon className="h-4 w-4" />
        <input
          value={bet}
          onChange={(e) => setBet(e.target.value)}
          inputMode="decimal"
          className="w-full bg-transparent text-base font-bold outline-none"
        />
      </div>
    </div>
  )
}

function CoinFace({
  z,
  back,
  label,
  gradient,
  ring,
  color,
  children,
}: {
  z: number
  back?: boolean
  label?: string
  gradient: string
  ring: string
  color: string
  children?: React.ReactNode
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full text-4xl font-black"
      style={{
        transform: `${back ? "rotateX(180deg) " : ""}translateZ(${z}px)`,
        backfaceVisibility: "hidden",
        background: gradient,
        color,
        border: `4px solid ${ring}`,
        boxShadow: `0 0 30px ${ring}aa, inset 0 4px 10px rgba(255,255,255,0.45), inset 0 -6px 12px rgba(0,0,0,0.3)`,
      }}
    >
      {children ?? label}
    </div>
  )
}

function Sheet({
  title,
  ton,
  onClose,
  children,
}: {
  title: string
  ton: number
  onClose: () => void
  children: React.ReactNode
}) {
  const { t } = useT()
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 w-full max-w-[480px] rounded-t-3xl px-4 pb-8 pt-4"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(0,255,65,0.4)",
          boxShadow: "0 -10px 40px rgba(0,255,65,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ChevronLeftIcon className="h-5 w-5" /> {t("common.back")}
          </button>
          <h2 className="text-base font-extrabold">{title}</h2>
          <div className="flex items-center gap-1 text-sm font-bold">
            <TonIcon className="h-4 w-4" />
            {ton.toFixed(2)}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
