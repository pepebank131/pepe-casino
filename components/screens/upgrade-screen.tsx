"use client"

import { useEffect, useState, useMemo } from "react"
import Image from "next/image"
import { useStore } from "@/lib/store"
import { useToast } from "@/components/toast"
import { CATALOG, RARITY, type Nft } from "@/lib/casino-data"
import { RarityBadge } from "@/components/rarity-badge"
import { TonIcon, ChevronLeftIcon, UpgradeIcon } from "@/components/icons"
import { useT } from "@/lib/i18n"
import { loadGlobalRtp, playUpgradeApi, isTelegram } from "@/lib/api-client"

export function UpgradeScreen({ onBack }: { onBack: () => void }) {
  const { inventory, removeFromInventory, addToInventory, refreshFromServer } = useStore()
  const toast = useToast()
  const { t } = useT()
  const [stakeUid, setStakeUid] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [angle, setAngle] = useState(0)
  const [rtp, setRtp] = useState(97)
  // Snapshot of the staked NFT, target and chance captured at spin start so the
  // wheel stays stable even though the staked NFT leaves inventory immediately.
  const [spinSnap, setSpinSnap] = useState<{ stake: Nft; target: Nft; chance: number } | null>(null)

  const stake = inventory.find((i) => i.uid === stakeUid) || null
  const target = CATALOG.find((c) => c.id === targetId) || null

  useEffect(() => {
    let active = true
    loadGlobalRtp()
      .then((value) => active && setRtp(Math.max(1, Math.min(99, Math.round(value)))))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // While spinning, the staked NFT is already gone from inventory, so fall back
  // to the captured snapshot to keep the wheel and previews stable.
  const dispStake = spinSnap?.stake ?? stake
  const dispTarget = spinSnap?.target ?? target

  // possible targets = catalog items at least 0.5 TON more expensive than stake
  const UPGRADE_EXCLUDED = ["plushpepe"]
  const MIN_GAP = 0.5
  const targets = useMemo(() => {
    if (!stake) return []
    return CATALOG
      .filter((c) => c.price >= stake.price + MIN_GAP && !UPGRADE_EXCLUDED.includes(c.id))
      .sort((a, b) => a.price - b.price)
  }, [stake])

  const chance = useMemo(() => {
    if (!stake || !target) return 0
    const c = Math.min(rtp, Math.max(1, Math.round((stake.price / target.price) * rtp)))
    return c
  }, [stake, target, rtp])

  // Chance shown on the wheel — uses the frozen snapshot during a spin.
  const dispChance = spinSnap?.chance ?? chance

  async function upgrade() {
    if (!stake || !target || spinning) return
    if (stake.price < 0.1) {
      toast(t("common.minBet"), "error")
      return
    }
    const stakedUid = stake.uid
    const stakedName = stake.name
    const targetIdLocal = target.id
    const targetName = target.name
    const chanceFrozen = chance
    setSpinSnap({ stake, target, chance })
    setSpinning(true)

    let win = Math.random() * 100 < chanceFrozen
    if (isTelegram()) {
      try {
        const res = await playUpgradeApi(stakedUid, targetIdLocal)
        win = res.win
        removeFromInventory(stakedUid)
      } catch (e: any) {
        setSpinning(false)
        setSpinSnap(null)
        toast(e?.message || "Upgrade failed", "error")
        return
      }
    } else {
      removeFromInventory(stakedUid)
    }

    const greenDeg = (chanceFrozen / 100) * 360
    const fullSpins = 360 * 5
    setAngle((currentAngle) => {
      const base = (currentAngle + fullSpins) % 360
      let land: number
      if (win) land = 360 - greenDeg + Math.random() * (greenDeg - 2) + 1
      else land = 1 + Math.random() * (360 - greenDeg - 2)
      let extra = land - base
      if (extra <= 0) extra += 360
      return currentAngle + fullSpins + extra
    })

    setTimeout(async () => {
      setSpinning(false)
      setSpinSnap(null)
      if (win) {
        if (isTelegram()) await refreshFromServer().catch(() => {})
        else addToInventory(targetIdLocal)
        toast(`✅ ${targetName}!`, "win")
      } else {
        if (isTelegram()) await refreshFromServer().catch(() => {})
        toast(`❌ ${stakedName}`, "error")
      }
      setStakeUid(null)
      setTargetId(null)
    }, 3100)
  }

  return (
    <div className="px-4 pb-28 pt-2">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ChevronLeftIcon className="h-5 w-5" /> Menu
        </button>
        <h2 className="flex items-center gap-1.5 text-base font-extrabold">
          <UpgradeIcon className="h-5 w-5 text-pepe-light" /> Upgrade
        </h2>
        <span className="w-12" />
      </div>

      {/* wheel */}
      <div className="relative mx-auto mb-4 flex h-52 w-52 items-center justify-center">
        <div className="pointer-events-none absolute -top-1 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[16px] border-x-transparent border-t-white" />
        <div
          className="h-48 w-48 rounded-full"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: spinning ? "transform 3s cubic-bezier(0.15,0.7,0.15,1)" : "none",
            background: `conic-gradient(#00ff41 0deg ${dispChance * 3.6}deg, #ff4d6d ${dispChance * 3.6}deg 360deg)`,
            boxShadow: "0 0 30px rgba(0,255,65,0.3), inset 0 0 30px rgba(0,0,0,0.5)",
          }}
        />
        <div
          className="absolute flex h-24 w-24 flex-col items-center justify-center overflow-hidden rounded-full bg-[#06120a] text-center"
          style={{ border: "2px solid rgba(0,255,65,0.3)" }}
        >
          {dispTarget ? (
            <Image
              src={dispTarget.img || "/placeholder.svg"}
              alt={dispTarget.name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-[12px] object-contain"
            />
          ) : (
            <span className="text-3xl font-black text-glow">{dispChance}%</span>
          )}
          <span className="text-[10px] font-bold text-pepe-light">{dispChance}% win</span>
        </div>
      </div>

      {/* selection summary */}
      <div className="mb-4 flex items-center justify-center gap-3">
        <SlotPreview nft={dispStake} label="Your NFT" />
        <UpgradeIcon className="h-6 w-6 rotate-90 text-muted-foreground" />
        <SlotPreview nft={dispTarget} label="Target" />
      </div>

      <button
        onClick={upgrade}
        disabled={!stake || !target || spinning}
        className="btn-3d mb-5 w-full rounded-2xl py-4 text-base font-extrabold disabled:cursor-not-allowed"
      >
        {spinning ? "Upgrading..." : "Upgrade Now"}
      </button>

      {/* pick stake */}
      <h3 className="mb-2 text-sm font-extrabold">1. Select your NFT</h3>
      {inventory.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">Inventory empty. Open cases to get NFTs first.</p>
      ) : (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {inventory.filter((n) => !UPGRADE_EXCLUDED.includes(n.id)).map((n) => (
            <PickCard
              key={n.uid}
              nft={n}
              active={stakeUid === n.uid}
              onClick={() => {
                setStakeUid(n.uid)
                setTargetId(null)
              }}
            />
          ))}
        </div>
      )}

      {/* pick target */}
      <h3 className="mb-2 text-sm font-extrabold">2. Choose target</h3>
      {!stake ? (
        <p className="text-sm text-muted-foreground">Select one of your NFTs first.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {targets.map((n) => (
            <PickCard key={n.id} nft={n} active={targetId === n.id} onClick={() => setTargetId(n.id)} grid />
          ))}
        </div>
      )}
    </div>
  )
}

function SlotPreview({ nft, label }: { nft: Nft | null; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: nft ? "transparent" : "rgba(255,255,255,0.04)",
          border: nft ? "none" : "1px dashed rgba(255,255,255,0.15)",
        }}
      >
        {nft ? (
          <Image src={nft.img || "/placeholder.svg"} alt={nft.name} width={56} height={56} className="h-14 w-14 rounded-[12px] object-contain" style={{ filter: `drop-shadow(0 3px 9px ${RARITY[nft.rarity].glow})` }} />
        ) : (
          <span className="text-xs text-muted-foreground">?</span>
        )}
      </div>
      <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{label}</span>
    </div>
  )
}

function PickCard({ nft, active, onClick, grid }: { nft: Nft; active: boolean; onClick: () => void; grid?: boolean }) {
  const r = RARITY[nft.rarity]
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 flex-col items-center rounded-xl p-2 transition active:scale-95 ${grid ? "w-full" : "w-24"}`}
      style={{
        background: "transparent",
        border: active ? `2px solid ${r.color}` : `1px solid ${r.color}33`,
        boxShadow: active ? `0 0 16px ${r.glow}` : "none",
      }}
    >
      <Image src={nft.img || "/placeholder.svg"} alt={nft.name} width={48} height={48} className="h-12 w-12 rounded-[12px] object-contain" style={{ filter: `drop-shadow(0 3px 8px ${r.glow})` }} />
      <span className="mt-1 max-w-full truncate text-[10px] font-bold">{nft.name}</span>
      <span className="mt-0.5">
        <RarityBadge rarity={nft.rarity} />
      </span>
      <span className="mt-1 flex items-center gap-0.5 text-[10px] font-bold">
        <TonIcon className="h-2.5 w-2.5" />
        {nft.price}
      </span>
    </button>
  )
}
