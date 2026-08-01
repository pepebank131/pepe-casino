"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Image from "next/image"
import { useStore, type InventoryItem } from "@/lib/store"
import { useToast } from "@/components/toast"
import { useT } from "@/lib/i18n"
import { nftById, bestRocketNftForWinnings, MIN_NFT_PRICE, ROCKET_TIERS } from "@/lib/casino-data"
import { TonIcon, RocketIcon } from "@/components/icons"
import { NftPicker } from "@/components/nft-picker"
import { playClick, playError, playLiftoff, playCashout, playCrash, startRocketHum } from "@/lib/sound"
import {
  fetchRocketState,
  placeRocketBet,
  cashoutRocket,
  isTelegram,
  getTgUser,
  type RocketState,
  type RocketBet,
} from "@/lib/api-client"

// Must match the server growth constant in lib/rocket-store.ts.
const GROWTH = 1.06
const POLL_MS = 1000
const W = 360
const H = 220

// Module-level cache of the last shared round state + clock sync. Survives
// unmount/remount (e.g. switching tabs) so returning to Rocket resumes the
// current round immediately instead of flashing a fresh 5s countdown.
let cachedState: RocketState | null = null
let cachedPolledMult = 1
let cachedPolledServerNow = 0
let cachedClockOffset = 0

// Normalized card data rendered in the shared live-bets list.
interface CardData {
  key: string
  name: string
  photo?: string
  amount: number
  cashedAt: number | null
  lost: boolean
  nftId: string | null
  isYou: boolean
}

export function RocketScreen() {
  const { ton, spendTon, addTon, addToInventory, inventory, removeFromInventory, username, photoUrl, setTon } = useStore()
  const toast = useToast()
  const { t } = useT()

  const [state, setState] = useState<RocketState | null>(cachedState)
  const [liveMult, setLiveMult] = useState(1)
  const liveMultRef = useRef(1)
  const multDisplayRef = useRef<HTMLSpanElement>(null)
  const cashoutBtnRef = useRef<HTMLButtonElement>(null)
  const [bet, setBet] = useState("0.1")
  // Bet mode + the NFT staked for the current bet (if any). When staking an
  // NFT we remove it from inventory up front and remember it here so a cashout
  // pays floor price × multiplier in TON and a crash means it's gone for good.
  const [mode, setMode] = useState<"ton" | "nft">("ton")
  const [pickedNft, setPickedNft] = useState<InventoryItem | null>(null)
  const stakedNftRef = useRef<InventoryItem | null>(null)
  // Crash-pill history comes straight from the server (persisted in the DB),
  // so it survives reloads and tab switches instead of resetting on mount.
  const history = state?.history ?? []
  const [placing, setPlacing] = useState(false)

  // Local-only bet overlay used in demo/preview mode (no Telegram auth, so the
  // server bet endpoint is unavailable and we never touch the shared DB).
  const [demoBet, setDemoBet] = useState<{ roundId: string; amount: number; cashedAt: number | null } | null>(null)

  const tgUser = getTgUser()
  const myId = tgUser?.id ?? "demo"
  const inTelegram = isTelegram()

  // Smooth-multiplier interpolation refs. Seed from the module cache so a
  // remount continues the same round without resetting timing.
  const polledMultRef = useRef(cachedPolledMult)
  const polledServerNowRef = useRef(cachedPolledServerNow)
  const clockOffsetRef = useRef(cachedClockOffset)
  const rafRef = useRef(0)

  // Round-transition bookkeeping. Seed prevRound from cache so a remount
  // mid-round is not mistaken for a brand-new round.
  const prevStatusRef = useRef<string>(cachedState?.status ?? "")
  const prevRoundRef = useRef<string>(cachedState?.roundId ?? "")
  const cashedRef = useRef(false)
  // Continuous rising hum tied to the live multiplier while flying.
  const humRef = useRef<{ update: (mult: number) => void; stop: () => void } | null>(null)

  // --- Poll shared server state -------------------------------------------
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const s = await fetchRocketState()
        if (!alive) return
        polledMultRef.current = s.multiplier
        polledServerNowRef.current = s.serverNow
        clockOffsetRef.current = s.serverNow - Date.now()
        // Persist to the module cache so the next mount resumes instantly.
        cachedState = s
        cachedPolledMult = s.multiplier
        cachedPolledServerNow = s.serverNow
        cachedClockOffset = clockOffsetRef.current
        setState(s)
        if (s.status === "flying") humRef.current?.update(s.multiplier)
      } catch {
        // transient network error; keep last known state
      } finally {
        if (alive) timer = setTimeout(poll, POLL_MS)
      }
    }
    poll()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  // Resume the hum if the component mounts mid-flight (e.g. switching tabs),
  // and make sure it's torn down on unmount either way.
  useEffect(() => {
    if (cachedState?.status === "flying" && !humRef.current) {
      humRef.current = startRocketHum()
    }
    return () => {
      humRef.current?.stop()
      humRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Smoothly interpolate the multiplier between polls while flying ------
  useEffect(() => {
    if (!state) return
    if (state.status !== "flying") {
      setLiveMult(state.status === "crashed" ? state.crashPoint ?? state.multiplier : 1)
      return
    }
    const tick = () => {
      const aheadMs = Math.min(1400, Date.now() + clockOffsetRef.current - polledServerNowRef.current)
      const m = polledMultRef.current * Math.pow(GROWTH, Math.max(0, aheadMs) / 1000)
      const rounded = Math.round(m * 100) / 100
      liveMultRef.current = rounded
      setLiveMult(rounded)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state?.status, state?.startedAt])

  // --- React to round / status transitions --------------------------------
  useEffect(() => {
    if (!state) return
    const prevStatus = prevStatusRef.current
    const prevRound = prevRoundRef.current

    // New round started: clear per-round local flags.
    if (state.roundId !== prevRound) {
      cashedRef.current = false
      if (demoBet && demoBet.roundId !== state.roundId) setDemoBet(null)
    }

    // Round just took off: liftoff whoosh + start the rising hum.
    if (prevStatus === "waiting" && state.status === "flying") {
      playLiftoff()
      humRef.current?.stop()
      humRef.current = startRocketHum()
    }

    // Round just crashed: bust feedback for the local user. (History pills are
    // server-driven now, so we don't accumulate them client-side.)
    if (prevStatus === "flying" && state.status === "crashed") {
      playCrash()
      humRef.current?.stop()
      humRef.current = null
      const cp = state.crashPoint ?? state.multiplier
      const myActive = myActiveBet(state)
      if (myActive && myActive.cashedAt == null) {
        const lostNft = stakedNftRef.current
        stakedNftRef.current = null
        toast(
          lostNft
            ? t("rocket.nftBust", { m: cp.toFixed(2), name: lostNft.name })
            : t("rocket.crashedToast", { m: cp.toFixed(2) }),
          "error",
        )
      }
    }

    prevStatusRef.current = state.status
    prevRoundRef.current = state.roundId
  }, [state?.roundId, state?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Returns the local user's bet for the current round (server or demo).
  function myActiveBet(s: RocketState): { amount: number; cashedAt: number | null } | null {
    if (inTelegram) {
      const b = s.bets.find((x) => x.userId === myId)
      return b ? { amount: b.amount, cashedAt: b.cashedAt } : null
    }
    if (demoBet && demoBet.roundId === s.roundId) return { amount: demoBet.amount, cashedAt: demoBet.cashedAt }
    return null
  }

  const status = state?.status ?? "waiting"
  const crashed = status === "crashed"
  const running = status === "flying"
  const waiting = status === "waiting"
  const mult = waiting ? 1 : liveMult
  const countdown = state ? Math.max(0, Math.ceil(state.msUntilNext / 1000)) : 5

  const myBet = state ? myActiveBet(state) : null
  const iAmIn = !!myBet && myBet.cashedAt == null && (running || waiting)
  const iCashed = !!myBet && myBet.cashedAt != null

  // --- Place a bet (only valid while WAITING) ------------------------------
  const placeBet = useCallback(async () => {
    if (!state || state.status !== "waiting") return toast(t("rocket.waitNext"), "info")
    if (myBet) return

    // Resolve the wager amount from the active mode. For NFT bets the staked
    // floor price is the "amount" so the shared cards/cashout math line up.
    let amount: number
    let staked: InventoryItem | null = null
    if (mode === "nft") {
      if (inTelegram) {
        playError()
        return toast("NFT rocket bets temporarily disabled — use TON", "error")
      }
      if (!pickedNft) { playError(); return toast(t("rocket.pickNft"), "error") }
      staked = pickedNft
      amount = Math.round(pickedNft.price * 100) / 100
      removeFromInventory(pickedNft.uid)
    } else {
      const n = Number.parseFloat(bet)
      if (!n || n <= 0) { playError(); return toast(t("rocket.betValid"), "error") }
      if (n < 0.1) { playError(); return toast(t("common.minBet"), "error") }
      if (!inTelegram && !spendTon(n)) { playError(); return toast(t("cases.notEnough"), "error") }
      if (inTelegram && ton < n) { playError(); return toast(t("cases.notEnough"), "error") }
      amount = n
    }

    setPlacing(true)
    try {
      if (inTelegram) {
        const next = await placeRocketBet(amount)
        if (typeof (next as any).ton === "number") setTon((next as any).ton)
        setState(next)
        polledMultRef.current = next.multiplier
        polledServerNowRef.current = next.serverNow
        clockOffsetRef.current = next.serverNow - Date.now()
      } else {
        setDemoBet({ roundId: state.roundId, amount, cashedAt: null })
      }
      // Record the staked NFT only after the bet is accepted.
      stakedNftRef.current = staked
      setPickedNft(null)
      cashedRef.current = false
      playClick()
      toast(
        staked
          ? t("rocket.nftStaked", { name: staked.name })
          : t("rocket.betPlacedToast", { n: amount }),
        "win",
      )
    } catch (e: any) {
      // Refund on failure (e.g. round advanced before the request landed).
      if (staked) addToInventory(staked.id)
      else addTon(amount)
      playError()
      toast(e?.message === "round_in_progress" ? t("rocket.waitNext") : t("rocket.betValid"), "error")
    } finally {
      setPlacing(false)
    }
  }, [state, myBet, bet, mode, pickedNft, inTelegram, spendTon, addTon, addToInventory, removeFromInventory, toast, t])

  // --- Cash out the active bet (only valid while FLYING) -------------------
  const doCashout = useCallback(async () => {
    if (!state || state.status !== "flying" || cashedRef.current || !iAmIn) return
    cashedRef.current = true
    try {
      if (inTelegram) {
        const res = await cashoutRocket()
        if (typeof (res as any).ton === "number") setTon((res as any).ton)
        // Server already credited TON — only show toast (no local NFT mint from client RNG)
        playCashout()
        toast(`Cashed @ ${res.multiplier.toFixed(2)}x · +${res.won} TON`, "win")
        setState(res.state)
      } else {
        const m = liveMult
        const win = Math.round((demoBet?.amount ?? 0) * m * 100) / 100
        setDemoBet((d) => (d ? { ...d, cashedAt: m } : d))
        applyWin(win, m)
      }
    } catch (e: any) {
      cashedRef.current = false
      playError()
      toast(e?.message === "crashed" ? t("rocket.crashedToast", { m: mult.toFixed(2) }) : t("rocket.betValid"), "error")
    }
  }, [state, iAmIn, inTelegram, liveMult, demoBet, mult, toast, t])

  // Credits winnings. NFT stakes receive a matching NFT prize first; TON is
  // only used as fallback when the win is below the cheapest available NFT.
  function applyWin(won: number, atMult: number) {
    playCashout()
    const staked = stakedNftRef.current
    if (staked) {
      stakedNftRef.current = null
      const wonNft = bestRocketNftForWinnings(won)
      if (wonNft) {
        addToInventory(wonNft.id)
        toast(t("rocket.cashedNftToast", { m: atMult.toFixed(2), name: wonNft.name }), "win")
      } else {
        addTon(won)
        toast(t("rocket.nftCashed", { m: atMult.toFixed(2), n: won, name: staked.name }), "win")
      }
      return
    }
    // Give NFT only if multiplier >= 1.1 AND win >= cheapest NFT price
    const wonNft = atMult >= 1.1 ? bestRocketNftForWinnings(won) : null
    if (wonNft) {
      addToInventory(wonNft.id)
      toast(t("rocket.cashedNftToast", { m: atMult.toFixed(2), name: wonNft.name }), "win")
    } else {
      addTon(won)
      toast(t("rocket.cashedToast", { m: atMult.toFixed(2), n: won }), "win")
    }
  }

  // --- Build the shared live-bets cards ------------------------------------
  const cards = buildCards(state, mult, crashed, myId, inTelegram, demoBet, username, photoUrl)

  return (
    <div className="px-4 pb-28 pt-2">
      {/* history row — last 5 results, newest on the LEFT */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {history.length === 0 ? (
          <span className="text-xs font-semibold text-muted-foreground">{t("rocket.liveBets")}</span>
        ) : (
          // history comes DESC (newest first) from DB — take first 5, show as-is (newest left)
          history.slice(0, 5).map((h, i) => {
            const isGreen = h >= 1.4
            const isYellow = h >= 1.1 && h < 1.4
            const color = isGreen ? "#39FF14" : isYellow ? "#ffd600" : "#ff8094"
            const bg = isGreen ? "rgba(0,255,65,0.12)" : isYellow ? "rgba(255,214,0,0.12)" : "rgba(255,77,109,0.12)"
            const border = isGreen ? "rgba(0,255,65,0.3)" : isYellow ? "rgba(255,214,0,0.3)" : "rgba(255,77,109,0.3)"
            return (
              <span
                key={i}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums"
                style={{ background: bg, color, border: `1px solid ${border}` }}
              >
                {h.toFixed(2)}x
              </span>
            )
          })
        )}
      </div>

      {/* graph + nft rain */}
      <div
        className="relative mb-4 overflow-hidden rounded-3xl"
        style={{
          height: H,
          background: crashed
            ? "radial-gradient(120% 120% at 50% 50%, rgba(255,40,70,0.35), #120306)"
            : "radial-gradient(120% 100% at 50% 110%, rgba(0,255,65,0.14), #04080c)",
          border: `1px solid ${crashed ? "rgba(255,77,109,0.4)" : "rgba(0,255,65,0.22)"}`,
          boxShadow: crashed ? "inset 0 0 60px rgba(255,40,70,0.3)" : "inset 0 0 50px rgba(0,255,65,0.1)",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <CurveGraph mult={mult} crashed={crashed} running={running} />

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {waiting ? (
            <>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t("rocket.nextRoundIn")}
              </span>
              <span className="text-5xl font-black tabular-nums text-glow">{countdown}</span>
            </>
          ) : (
            <span
              className="text-6xl font-black tabular-nums"
              style={{
                color: crashed ? "#ff4d6d" : "#39FF14",
                textShadow: crashed
                  ? "0 0 30px rgba(255,77,109,0.8)"
                  : "0 0 30px rgba(0,255,65,0.85), 0 0 60px rgba(0,255,65,0.4)",
              }}
            >
              {mult.toFixed(2)}x
            </span>
          )}
          {crashed && (
            <span className="mt-1 text-sm font-extrabold uppercase tracking-widest text-[#ff4d6d]">
              {t("rocket.crashed")}
            </span>
          )}
          {iCashed && !crashed && (
            <span className="mt-1 text-sm font-bold text-pepe-light">
              {t("rocket.cashedAt", { m: (myBet?.cashedAt ?? 0).toFixed(2) })}
            </span>
          )}
        </div>
      </div>

      {/* bet controls */}
      <div className="glass-card mb-4 rounded-2xl p-4">
        {/* mode toggle */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["ton", "nft"] as const).map((mInner) => (
            <button
              key={mInner}
              onClick={() => { setMode(mInner); playClick() }}
              disabled={!!myBet || !waiting}
              className="rounded-xl py-2 text-xs font-extrabold uppercase tracking-wide transition active:scale-95 disabled:opacity-50"
              style={{
                background: mode === mInner ? "var(--pepe)" : "rgba(255,255,255,0.05)",
                color: mode === mInner ? "#04130a" : "#eafff0",
                border: `1px solid ${mode === mInner ? "transparent" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {mInner === "ton" ? t("rocket.betTon") : t("rocket.betNft")}
            </button>
          ))}
        </div>

        {mode === "ton" ? (
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1">
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
          </div>
        ) : (
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("rocket.stakeNft")}
            </label>
            <NftPicker inventory={inventory} selectedUid={pickedNft?.uid ?? null} onSelect={setPickedNft} />
            {pickedNft && (
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                {t("rocket.nftStakeHint", { name: pickedNft.name, n: pickedNft.price.toFixed(2) })}
              </p>
            )}
          </div>
        )}

        {iAmIn && running ? (
          <button
            onClick={doCashout}
            className="w-full rounded-2xl py-4 text-base font-extrabold text-[#04130a] active:translate-y-1"
            style={{
              background: "linear-gradient(180deg,#ffe14d,#ffb000)",
              boxShadow: "0 6px 0 #a87f00, 0 10px 22px rgba(255,200,0,0.4)",
            }}
          >
            {t("rocket.cashOut", { n: Math.round((myBet?.amount ?? 0) * mult * 100) / 100 })}
          </button>
        ) : (
          <button
            onClick={placeBet}
            disabled={placing || !!myBet || !waiting || (mode === "nft" && !pickedNft)}
            className="btn-3d flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RocketIcon className="h-5 w-5" />
            {myBet
              ? t("rocket.betPlaced")
              : !waiting
                ? t("rocket.roundInProgress")
                : mode === "nft"
                  ? t("rocket.stakeNftCta")
                  : t("rocket.placeBet", { n: bet || "0" })}
          </button>
        )}

        <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
          {mode === "nft" ? t("rocket.nftStakeTip") : t("rocket.nftHint", { n: MIN_NFT_PRICE.toFixed(2) })}
        </p>
      </div>

      {/* live players (shared across all clients) */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-extrabold">{t("rocket.liveBets")}</h3>
        <span className="text-xs font-semibold text-muted-foreground">
          {t("rocket.playersCount", { n: cards.length })}
        </span>
      </div>
      <div className="space-y-2">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.1)] py-6 text-center text-xs font-semibold text-muted-foreground">
            {t("rocket.noBets")}
          </div>
        ) : (
          cards.map((c) => <PlayerCard key={c.key} c={c} />)
        )}
      </div>
    </div>
  )
}

// Builds the normalized shared bet cards. The local user's demo bet (preview
// mode) is injected because it never reaches the server.
function buildCards(
  state: RocketState | null,
  mult: number,
  crashed: boolean,
  myId: string,
  inTelegram: boolean,
  demoBet: { roundId: string; amount: number; cashedAt: number | null } | null,
  username: string,
  photoUrl: string | null | undefined,
): CardData[] {
  if (!state) return []
  const cards: CardData[] = state.bets.map((b: RocketBet) => cardFromBet(b, mult, crashed, b.userId === myId))

  if (!inTelegram && demoBet && demoBet.roundId === state.roundId) {
    cards.unshift(
      cardFromBet(
        {
          userId: myId,
          username: username || "You",
          photo: photoUrl || "",
          amount: demoBet.amount,
          cashedAt: demoBet.cashedAt,
          won: demoBet.cashedAt != null ? Math.round(demoBet.amount * demoBet.cashedAt * 100) / 100 : null,
        },
        mult,
        crashed,
        true,
      ),
    )
  }
  return cards
}

function cardFromBet(b: RocketBet, mult: number, crashed: boolean, isYou: boolean): CardData {
  const lost = crashed && b.cashedAt == null
  const refMult = b.cashedAt ?? mult
  const winnings = b.amount * refMult
  const nft = lost ? null : bestRocketNftForWinnings(winnings)
  return {
    key: `${b.userId}`,
    name: b.username,
    photo: b.photo || undefined,
    amount: b.amount,
    cashedAt: b.cashedAt,
    lost,
    nftId: nft ? nft.id : null,
    isYou,
  }
}

function PlayerCard({ c }: { c: CardData }) {
  const { t } = useT()
  const cashed = c.cashedAt != null
  const win = cashed ? Math.round(c.amount * (c.cashedAt as number) * 100) / 100 : 0
  const lost = c.lost
  const nft = c.nftId && !lost ? nftById(c.nftId) : null
  const hue = (c.name.charCodeAt(0) * 7) % 360

  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-2.5"
      style={{
        background: c.isYou
          ? "linear-gradient(160deg, rgba(0,255,65,0.12), rgba(11,15,18,0.85))"
          : "linear-gradient(160deg, rgba(255,255,255,0.03), rgba(11,15,18,0.85))",
        border: `1px solid ${
          cashed
            ? "rgba(0,255,65,0.4)"
            : lost
              ? "rgba(255,77,109,0.35)"
              : c.isYou
                ? "rgba(0,255,65,0.3)"
                : "rgba(255,255,255,0.07)"
        }`,
      }}
    >
      {c.photo ? (
        <Image
          src={c.photo || "/placeholder.svg"}
          alt={c.name}
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-cover"
          style={{ border: "2px solid rgba(0,255,65,0.5)" }}
        />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-black"
          style={{ background: `hsl(${hue} 70% 55%)` }}
        >
          {c.name[0]?.toUpperCase() ?? "?"}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-extrabold">{c.name}</span>
          {c.isYou && (
            <span className="rounded bg-[rgba(0,255,65,0.2)] px-1.5 py-0.5 text-[9px] font-black uppercase text-pepe-light">
              {t("rocket.you")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-bold tabular-nums text-muted-foreground">
          <TonIcon className="h-3 w-3" />
          {c.amount.toFixed(2)}
          <span
            className="ml-1 rounded px-1 py-0.5 text-[10px] font-black"
            style={{
              background: cashed ? "rgba(0,255,65,0.15)" : "rgba(255,255,255,0.06)",
              color: cashed ? "#39FF14" : "#7da890",
            }}
          >
            {cashed ? `x${(c.cashedAt as number).toFixed(2)}` : lost ? t("rocket.bust") : t("rocket.inRound")}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        {cashed ? (
          <span className="flex items-center justify-end gap-1 text-sm font-black text-pepe-light">
            +{win}
            <TonIcon className="h-3.5 w-3.5" />
          </span>
        ) : lost ? (
          <span className="text-sm font-black text-[#ff4d6d]">-{c.amount.toFixed(2)}</span>
        ) : (
          <span className="text-xs font-bold text-muted-foreground">…</span>
        )}
      </div>

      {nft ? (
        <Image
          src={nft.img || "/placeholder.svg"}
          alt={nft.name}
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full bg-transparent object-cover"
          title={nft.name}
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[rgba(255,255,255,0.12)]">
          <TonIcon className="h-4 w-4 opacity-40" />
        </span>
      )}
    </div>
  )
}

function CurveGraph({ mult, crashed, running }: { mult: number; crashed: boolean; running: boolean }) {
  const progress = Math.min(1, (mult - 1) / 9)
  const px = 10 + progress * (W - 20)
  const py = H - 14 - Math.min(H - 30, Math.pow(progress, 0.85) * (H - 36))

  const points: string[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * progress
    const x = 10 + t * (W - 20)
    const y = H - 14 - Math.min(H - 30, Math.pow(t, 0.85) * (H - 36))
    points.push(`${x},${y}`)
  }
  const linePath = `M ${points.join(" L ")}`
  const areaPath = running || crashed ? `${linePath} L ${px},${H - 14} L 10,${H - 14} Z` : ""

  const color = crashed ? "#ff4d6d" : "#39FF14"

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rk-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {(running || crashed) && (
        <>
          <path d={areaPath} fill="url(#rk-area)" />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g transform={`translate(${px - 11}, ${py - 11})`}>
            <circle cx="11" cy="11" r="13" fill={color} opacity="0.18" />
            {crashed ? (
              <g
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M11 2v5M11 15v5M2 11h5M15 11h5M5 5l3 3M14 14l3 3M17 5l-3 3M8 14l-3 3" />
              </g>
            ) : (
              <path
                d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 0Z M12 15 9 12c.5-3 2-6 6-9 3 0 5 2 5 5-3 4-6 5.5-9 6Z"
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}
          </g>
        </>
      )}
    </svg>
  )
}



