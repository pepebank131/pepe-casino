"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { CATALOG, normalizeCaseContents, nftById, type CasePrize, type Rarity } from "@/lib/casino-data"
import { PlayerDetailSheet } from "@/components/admin/player-detail-sheet"
import {
  loadCases,
  saveCases,
  loadPromos,
  savePromos,
  loadWithdrawals,
  markWithdrawalSent,
  loadMaintenance,
  saveMaintenance,
  loadGlobalRtp,
  saveGlobalRtp,
  loadWithdrawFee,
  saveWithdrawFee,
  loadRocketSettings,
  saveRocketSettingsApi,
  loadAdminPlayers,
  setPlayerBan,
  unbanAllPlayersApi,
  loadAdminMoney,
  loadAdminRefs,
  loadAdminReferrerDetail,
  loadUpgradeLogs,
  type UpgradeLogEntry,
  searchPlayersByIp,
  loadIpDuplicates,
  type IpPlayerRow,
  type IpDuplicateGroup,
  resetSeason,
  loadSeason,
  loadLeaderboardOverrides,
  saveLeaderboardOverrides,
  resetLeaderboardOverrides,
  type LeaderboardOverride,
  type PromoCodeItem,
  type WithdrawalItem,
  type AdminPlayerRow,
  type AdminBetRow,
  type AdminReferrerRow,
  type AdminReferrerDetail,
} from "@/lib/api-client"

type Tab = "players" | "cases" | "promos" | "withdrawals" | "money" | "nft" | "game" | "refs" | "settings" | "upgrades" | "ipsearch"

const TABS: { id: Tab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "cases", label: "Cases" },
  { id: "promos", label: "Promo Codes" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "money", label: "Money" },
  { id: "nft", label: "NFT" },
  { id: "game", label: "Game" },
  { id: "refs", label: "Refs" },
  { id: "upgrades", label: "⬆️ Upgrades" },
  { id: "ipsearch", label: "🔍 IP Search" },
  { id: "settings", label: "Settings" },
]

export function AdminPanel({ adminId }: { adminId: string }) {
  const [tab, setTab] = useState<Tab>("players")

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-black/60 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--pepe)] text-xs font-black text-black">
              A
            </span>
            <div>
              <h1 className="text-base font-extrabold leading-none text-foreground">PEPE Admin</h1>
              <p className="text-[11px] text-muted-foreground">ID {adminId}</p>
            </div>
          </div>
          <a
            href="/"
            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-foreground hover:border-[color:var(--pepe)]"
          >
            Exit
          </a>
        </div>
      </header>

      <nav className="sticky top-[57px] z-10 border-b border-[color:var(--border)] bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-[color:var(--pepe)] text-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-5">
        {tab === "players" && <PlayersTab adminId={adminId} />}
        {tab === "cases" && <CasesTab adminId={adminId} />}
        {tab === "promos" && <PromosTab adminId={adminId} />}
        {tab === "withdrawals" && <WithdrawalsTab adminId={adminId} />}
        {tab === "money" && <MoneyTab adminId={adminId} />}
        {tab === "nft" && <NftTab />}
        {tab === "game" && <GameTab adminId={adminId} />}
        {tab === "refs" && <RefsTab adminId={adminId} />}
        {tab === "upgrades" && <UpgradesTab adminId={adminId} />}
        {tab === "ipsearch" && <IpSearchTab adminId={adminId} />}
        {tab === "settings" && <SettingsTab adminId={adminId} />}
      </div>
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accent ? "text-[color:var(--pepe)]" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}

/* ---------------- PLAYERS ---------------- */
function PlayersTab({ adminId }: { adminId: string }) {
  const [players, setPlayers] = useState<AdminPlayerRow[]>([])
  const [stats, setStats] = useState({ total: 0, banned: 0, totalTon: 0 })
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [ipLookup, setIpLookup] = useState<string | null>(null)

  // Initial + debounced server-side search (matches id / nick / name).
  useEffect(() => {
    let active = true
    setLoading(true)
    const t = setTimeout(() => {
      loadAdminPlayers(adminId, q.trim())
        .then((res) => {
          if (!active) return
          setPlayers(res.players)
          setStats(res.stats)
          setError(null)
        })
        .catch((e) => active && setError(e.message || "Failed to load players"))
        .finally(() => active && setLoading(false))
    }, q ? 300 : 0)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [adminId, q])

  async function toggleBan(p: AdminPlayerRow) {
    setBusy(p.id)
    try {
      const banned = await setPlayerBan(p.id, !p.banned, adminId)
      setPlayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, banned } : x)))
      setStats((s) => ({ ...s, banned: s.banned + (banned ? 1 : -1) }))
    } catch (e: any) {
      setError(e.message || "Failed to update ban")
    } finally {
      setBusy(null)
    }
  }

  async function unbanAll() {
    if (stats.banned <= 0 || bulkBusy) return
    if (!confirm(`Unban all ${stats.banned} banned players?`)) return
    setBulkBusy(true)
    setError(null)
    try {
      const count = await unbanAllPlayersApi(adminId)
      setPlayers((prev) => prev.map((p) => ({ ...p, banned: false })))
      setStats((s) => ({ ...s, banned: Math.max(0, s.banned - count) }))
    } catch (e: any) {
      setError(e.message || "Failed to unban all players")
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total players" value={String(stats.total)} />
        <Stat label="Banned" value={String(stats.banned)} />
        <Stat label="Total TON" value={stats.totalTon.toFixed(1)} accent />
      </div>

      <button
        onClick={unbanAll}
        disabled={stats.banned <= 0 || bulkBusy}
        className="mb-3 w-full rounded-xl border border-[color:var(--crimson)]/35 bg-[color:var(--crimson)]/10 px-4 py-3 text-sm font-extrabold text-[color:var(--crimson)] transition disabled:cursor-not-allowed disabled:opacity-45"
      >
        {bulkBusy ? "Unblocking..." : `Unblock all banned players (${stats.banned})`}
      </button>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by Telegram ID or username…"
        className="mb-4 w-full rounded-xl border border-[color:var(--border)] bg-black/40 px-4 py-3 text-foreground outline-none focus:border-[color:var(--pepe)]"
      />

      {error && <p className="mb-3 text-sm text-[color:var(--crimson)]">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading players…</p>
      ) : (
        <div className="space-y-2">
          {players.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelected(p.id)}
              className="glass-card flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-3 transition hover:border-[color:var(--pepe)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-foreground">@{p.username}</span>
                  {p.banned && (
                    <span className="rounded-md bg-[color:var(--crimson)]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[color:var(--crimson)]">
                      Banned
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  ID {p.id} · {p.nftCount} NFTs{p.refBy ? ` · ref by ${p.refBy}` : ""}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/70">
                  IP:{" "}
                  {p.lastIp ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setIpLookup(p.lastIp) }}
                      className="text-[color:var(--pepe)]/80 underline decoration-dotted hover:text-[color:var(--pepe)]"
                      title="Знайти інших гравців з цією IP"
                    >
                      {p.lastIp}
                    </button>
                  ) : (
                    <span className="italic">не записано</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-[color:var(--pepe)]">{p.ton.toFixed(2)} TON</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleBan(p)
                  }}
                  disabled={busy === p.id}
                  className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                    p.banned
                      ? "bg-[color:var(--pepe)] text-black"
                      : "border border-[color:var(--crimson)]/50 text-[color:var(--crimson)]"
                  }`}
                >
                  {busy === p.id ? "…" : p.banned ? "Unban" : "Ban"}
                </button>
              </div>
            </div>
          ))}
          {players.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No players found.</p>
          )}
        </div>
      )}

      {selected && (
        <PlayerDetailSheet
          uid={selected}
          adminId={adminId}
          onClose={() => setSelected(null)}
          onBalanceChange={(uid, ton) =>
            setPlayers((prev) => prev.map((x) => (x.id === uid ? { ...x, ton } : x)))
          }
        />
      )}

      {ipLookup && <IpLookupModal ip={ipLookup} adminId={adminId} onClose={() => setIpLookup(null)} />}
    </div>
  )
}

function IpLookupModal({ ip, adminId, onClose }: { ip: string; adminId: string; onClose: () => void }) {
  const [players, setPlayers] = useState<IpPlayerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    searchPlayersByIp(ip, adminId)
      .then((res) => active && setPlayers(res))
      .catch((e) => active && setError(e.message || "Search failed"))
    return () => { active = false }
  }, [ip, adminId])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="glass-card relative z-10 w-full max-w-md rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-lg bg-black/50 px-3 py-1.5 font-mono text-sm font-bold text-orange-400">{ip}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">✕</button>
        </div>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : players === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Пошук…</p>
        ) : players.length <= 1 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Інших гравців з цією IP не знайдено — акаунт унікальний.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="mb-2 text-xs font-semibold text-orange-400">
              ⚠️ {players.length} акаунти ділять цю IP
            </p>
            {players.map((p) => (
              <div key={p.uid} className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
                {p.photo ? (
                  <img src={p.photo} alt={p.name} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--pepe)]/20 text-xs font-black text-[color:var(--pepe)]">
                    {p.name[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">@{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">ID: {p.uid} · {p.balance.toFixed(2)} TON</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- CASES ---------------- */
type EditPrize = { type: "nft"; id: string; chance: number } | { type: "ton"; amount: number; chance: number }
type EditCase = { id: string; name: string; price: number; cover: string; badge?: string; model?: "paid" | "free" | "deposit" | "referral"; cooldownMs?: number; contents: EditPrize[] }

function toEditPrizes(contents: CasePrize[]): EditPrize[] {
  return normalizeCaseContents(contents).map((p) => ({ ...p }))
}

function CasesTab({ adminId }: { adminId: string }) {
  const [cases, setCases] = useState<EditCase[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nftQuery, setNftQuery] = useState("")
  const [tonPrize, setTonPrize] = useState("0.5")
  const [tonChance, setTonChance] = useState("10")

  // Load the persisted configuration on mount.
  useEffect(() => {
    let active = true
    loadCases()
      .then((cfg) => {
        if (!active) return
        const paid = cfg.cases.map((c) => ({ id: c.id, name: c.name, price: c.price, cover: c.cover, badge: (c as any).badge || '', model: (c as any).model, cooldownMs: (c as any).cooldownMs, contents: toEditPrizes(c.contents as CasePrize[]) }))
        const free = cfg.free ? [{ id: cfg.free.id, name: cfg.free.name, price: cfg.free.price, cover: cfg.free.cover, model: (cfg.free as any).model ?? "free", cooldownMs: (cfg.free as any).cooldownMs, contents: toEditPrizes(cfg.free.contents as CasePrize[]) }] : []
        const deposit = cfg.deposit ? [{ id: cfg.deposit.id, name: cfg.deposit.name, price: cfg.deposit.price, cover: cfg.deposit.cover, model: (cfg.deposit as any).model ?? "deposit", cooldownMs: (cfg.deposit as any).cooldownMs, contents: toEditPrizes(cfg.deposit.contents as CasePrize[]) }] : []
        const referral = (cfg as any).referral ? [{ id: (cfg as any).referral.id, name: (cfg as any).referral.name, price: (cfg as any).referral.price, cover: (cfg as any).referral.cover, model: "referral" as const, cooldownMs: (cfg as any).referral.cooldownMs, contents: toEditPrizes((cfg as any).referral.contents as CasePrize[]) }] : []
        const promo = (cfg as any).promo ? [{ id: (cfg as any).promo.id, name: (cfg as any).promo.name, price: (cfg as any).promo.price, cover: (cfg as any).promo.cover, model: "promo" as const, cooldownMs: undefined, contents: toEditPrizes((cfg as any).promo.contents as CasePrize[]) }] : []
        setCases([...paid, ...free, ...deposit, ...referral, ...promo])
      })
      .catch((e) => active && setError(e.message || "Failed to load cases"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [adminId])

  function update(id: string, patch: Partial<EditCase>) {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function toggleContent(id: string, nftId: string) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              contents: c.contents.some((x) => x.type === "nft" && x.id === nftId)
                ? c.contents.filter((x) => !(x.type === "nft" && x.id === nftId))
                : [...c.contents, { type: "nft", id: nftId, chance: 10 }],
            }
          : c,
      ),
    )
  }

  function setPrizeChance(caseId: string, index: number, chance: number) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? {
              ...c,
              contents: c.contents.map((p, i) => (i === index ? { ...p, chance: Math.max(0, Number(chance) || 0) } : p)),
            }
          : c,
      ),
    )
  }

  function removePrize(caseId: string, index: number) {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, contents: c.contents.filter((_, i) => i !== index) } : c)))
  }

  function addTonPrize(caseId: string) {
    const amount = Math.max(0, Number(tonPrize) || 0)
    const chance = Math.max(0, Number(tonChance) || 0)
    if (amount <= 0) return
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, contents: [...c.contents, { type: "ton", amount, chance }] } : c)))
  }

  function createCase() {
    const id = `custom-${Date.now()}`
    setCases((prev) => [
      ...prev,
      { id, name: "New Custom Case", price: 1, cover: CATALOG[0].img, contents: [] },
    ])
    setEditing(id)
  }

  function removeCase(id: string) {
    setCases((prev) => prev.filter((c) => c.id !== id))
    if (editing === id) setEditing(null)
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    setError(null)
    try {
      const payload = {
        cases: cases.filter((c) => c.id !== "free-daily" && c.id !== "deposit" && c.id !== "referral" && c.id !== "promo"),
        free: cases.find((c) => c.id === "free-daily") ?? null,
        deposit: cases.find((c) => c.id === "deposit") ?? null,
        referral: cases.find((c) => c.id === "referral") ?? null,
        promo: cases.find((c) => c.id === "promo") ?? null,
        adminId,
      }
      await saveCases(payload as any)
      setStatus("Saved to database ✅")
      // Reload to confirm saved data
      const fresh = await loadCases()
      if (fresh.cases) {
        const paid = fresh.cases.map((c: any) => ({ id: c.id, name: c.name, price: c.price, cover: c.cover, badge: (c as any).badge || '', model: c.model, cooldownMs: c.cooldownMs, contents: toEditPrizes(c.contents) }))
        const free = fresh.free ? [{ id: fresh.free.id, name: fresh.free.name, price: fresh.free.price, cover: fresh.free.cover, badge: (fresh.free as any).badge || '', model: (fresh.free as any).model ?? "free", cooldownMs: (fresh.free as any).cooldownMs, contents: toEditPrizes(fresh.free.contents) }] : []
        const deposit = fresh.deposit ? [{ id: fresh.deposit.id, name: fresh.deposit.name, price: fresh.deposit.price, cover: fresh.deposit.cover, badge: (fresh.deposit as any).badge || '', model: (fresh.deposit as any).model ?? "deposit", cooldownMs: (fresh.deposit as any).cooldownMs, contents: toEditPrizes(fresh.deposit.contents) }] : []
        const referral = (fresh as any).referral ? [{ id: (fresh as any).referral.id, name: (fresh as any).referral.name, price: (fresh as any).referral.price, cover: (fresh as any).referral.cover, model: "referral" as const, cooldownMs: (fresh as any).referral.cooldownMs, contents: toEditPrizes((fresh as any).referral.contents) }] : []
        const promo = (fresh as any).promo ? [{ id: (fresh as any).promo.id, name: (fresh as any).promo.name, price: (fresh as any).promo.price, cover: (fresh as any).promo.cover, model: "promo" as const, cooldownMs: undefined, contents: toEditPrizes((fresh as any).promo.contents) }] : []
        setCases([...paid, ...free, ...deposit, ...referral, ...promo])
      }
      setTimeout(() => setStatus(null), 2200)
    } catch (e: any) {
      setError(e.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading cases…</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-foreground">Cases ({cases.length})</h2>
        <div className="flex items-center gap-2">
          {status && <span className="text-xs font-semibold text-[color:var(--pepe)]">{status}</span>}
          {error && <span className="text-xs font-semibold text-[color:var(--crimson)]">{error}</span>}
          <button onClick={createCase} className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-bold text-foreground hover:border-[color:var(--pepe)]">
            + Create case
          </button>
          <button onClick={save} disabled={saving} className="btn-3d rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {cases.map((c) => (
          <div key={c.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Image src={c.cover || "/placeholder.svg"} alt={c.name} width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg object-contain" />
              <input
                value={c.name}
                onChange={(e) => update(c.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-base font-bold text-foreground outline-none"
              />
              <div className="flex shrink-0 items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={c.price}
                  onChange={(e) => update(c.id, { price: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-[color:var(--border)] bg-black/40 px-2 py-1.5 text-right text-sm font-bold text-[color:var(--pepe)] outline-none"
                />
                <span className="text-xs text-muted-foreground">TON</span>
                <button
                  onClick={() => {
                    setEditing(editing === c.id ? null : c.id)
                    setNftQuery("")
                  }}
                  className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-foreground hover:border-[color:var(--pepe)]"
                >
                  {editing === c.id ? "Done" : "Edit"}
                </button>
                <button
                  onClick={() => removeCase(c.id)}
                  className="rounded-lg border border-[color:var(--crimson)]/40 px-3 py-1.5 text-xs font-semibold text-[color:var(--crimson)] hover:bg-[color:var(--crimson)]/10"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{c.contents.length} items in pool</p>
              {c.model && c.model !== "paid" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                  background: c.model === "referral" ? "rgba(138,43,226,0.25)" : c.model === "deposit" ? "rgba(255,140,30,0.2)" : "rgba(0,255,65,0.15)",
                  color: c.model === "referral" ? "#ba55d3" : c.model === "deposit" ? "#ffb04d" : c.model === "promo" ? "#ffd600" : "#00ff41",
                  border: `1px solid ${c.model === "referral" ? "rgba(186,85,211,0.4)" : c.model === "deposit" ? "rgba(255,176,77,0.4)" : c.model === "promo" ? "rgba(255,214,0,0.4)" : "rgba(0,255,65,0.3)"}`,
                }}>
                  {c.model === "referral" ? "👥 Реферальний" : c.model === "deposit" ? "💳 Депозитний" : c.model === "promo" ? "🎟️ Промокод" : "🎁 Безкоштовний"}
                </span>
              )}
            </div>

            {editing === c.id && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cover image URL</label>
                <input
                  value={c.cover}
                  onChange={(e) => update(c.id, { cover: e.target.value })}
                  placeholder="https://…"
                  className="mb-3 w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                />
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Модель кейса</label>
                <select
                  value={c.model ?? "paid"}
                  onChange={(e) => update(c.id, { model: e.target.value as EditCase["model"] })}
                  className="mb-3 w-full rounded-lg border border-[color:var(--border)] bg-black/90 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                >
                  <option value="paid">💰 Платний (звичайний)</option>
                  <option value="free">🎁 Безкоштовний (кулдаун)</option>
                  <option value="deposit">💳 Депозитний (гравець поповнив X TON)</option>
                  <option value="referral">👥 Реферальний (реферали задепонували X TON)</option>
                  <option value="promo">🎟️ Промокод (відкривається через промокод)</option>
                </select>
                {(c.model === "deposit" || c.model === "referral" || c.model === "free") && (
                  <>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {c.model === "free"
                        ? "Кулдаун (годин)"
                        : c.model === "deposit"
                        ? "Мінімальний депозит гравця (TON)"
                        : "Мінімальна сума рефералів (TON)"}
                    </label>
                    {c.model === "free" ? (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={c.cooldownMs != null ? Math.round(c.cooldownMs / 3600000) : 24}
                        onChange={(e) => update(c.id, { cooldownMs: Math.max(0, Number(e.target.value)) * 3600000 })}
                        className="mb-3 w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                      />
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={c.price}
                          onChange={(e) => update(c.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                          className="mb-2 w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                        />
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Кулдаун (годин)</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={c.cooldownMs != null ? Math.round(c.cooldownMs / 3600000) : (c.model === "deposit" ? 144 : 168)}
                          onChange={(e) => update(c.id, { cooldownMs: Math.max(0, Number(e.target.value)) * 3600000 })}
                          className="mb-3 w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                        />
                      </>
                    )}
                  </>
                )}
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Бейдж (ТОЛЬКО NFT / НОВИНКА / пусто)</label>
                <input
                  value={c.badge || ""}
                  onChange={(e) => update(c.id, { badge: e.target.value })}
                  placeholder="ТОЛЬКО NFT або НОВИНКА або пусто"
                  className="mb-3 w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                />
                <div className="mb-3 rounded-xl border border-[color:var(--border)] bg-black/25 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Active prizes and weights
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        Total {c.contents.reduce((s, p) => s + p.chance, 0).toFixed(1)}
                      </span>
                      <button
                        onClick={() => {
                          // NFTs ≤5 TON → together 99.5%, the rest → together 0.5%
                          const nfts = c.contents.map((p) => {
                            const nft = p.type === "nft" ? nftById(p.id) : null
                            return { p, price: nft ? nft.price : 0 }
                          })
                          const cheap = nfts.filter((x) => x.price <= 5 && x.p.type === "nft")
                          const expensive = nfts.filter((x) => x.price > 5 || x.p.type !== "nft")
                          const cheapWeight = cheap.length > 0 ? parseFloat((99.5 / cheap.length).toFixed(4)) : 0
                          const expWeight = expensive.length > 0 ? parseFloat((0.5 / expensive.length).toFixed(4)) : 0
                          setCases((prev) => prev.map((cs) => cs.id !== c.id ? cs : {
                            ...cs,
                            contents: cs.contents.map((p) => {
                              const nft = p.type === "nft" ? nftById(p.id) : null
                              const price = nft ? nft.price : 0
                              const isCheap = p.type === "nft" && price <= 5
                              return { ...p, chance: isCheap ? cheapWeight : expWeight }
                            })
                          }))
                        }}
                        className="rounded-lg px-2 py-1 text-[10px] font-bold"
                        style={{ background: "rgba(0,255,65,0.15)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.3)" }}
                        title="NFT ≤5 TON → 99.5% разом, решта → 0.5% разом"
                      >
                        ⚡ Авто-ваги
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {c.contents.map((p, index) => {
                      const nft = p.type === "nft" ? nftById(p.id) : null
                      const totalWeight = c.contents.reduce((s, x) => s + x.chance, 0)
                      const realPct = totalWeight > 0 ? ((p.chance / totalWeight) * 100).toFixed(2) : "0"
                      return (
                        <div key={`${p.type}-${index}-${p.type === "nft" ? p.id : p.amount}`} className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
                          {nft ? (
                            <Image src={nft.img || "/placeholder.svg"} alt={nft.name} width={34} height={34} className="h-8 w-8 rounded-md object-contain" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--pepe)]/15 text-[10px] font-black text-[color:var(--pepe)]">
                              TON
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-foreground">{nft ? nft.name : `${p.amount} TON`}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {nft ? `${nft.price} TON floor` : "Pure TON prize"}
                              <span className="ml-2 font-bold" style={{ color: Number(realPct) < 1 ? "#ff9a3d" : "#00ff41" }}>
                                {realPct}%
                              </span>
                            </p>
                          </div>
                          <input
                            type="number"
                            step="0.1"
                            value={p.chance}
                            onChange={(e) => setPrizeChance(c.id, index, Number(e.target.value))}
                            className="w-20 rounded-lg border border-[color:var(--border)] bg-black/40 px-2 py-1.5 text-right text-xs font-bold text-[color:var(--pepe)] outline-none"
                          />
                          <button
                            onClick={() => removePrize(c.id, index)}
                            className="rounded-lg border border-[color:var(--crimson)]/40 px-2 py-1.5 text-[10px] font-bold text-[color:var(--crimson)]"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                    {c.contents.length === 0 && <p className="py-2 text-xs text-muted-foreground">No prizes yet.</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={tonPrize}
                      onChange={(e) => setTonPrize(e.target.value)}
                      inputMode="decimal"
                      placeholder="TON amount"
                      className="w-28 rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                    />
                    <input
                      value={tonChance}
                      onChange={(e) => setTonChance(e.target.value)}
                      inputMode="decimal"
                      placeholder="Weight"
                      className="w-24 rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                    />
                    <button
                      onClick={() => addTonPrize(c.id)}
                      className="rounded-lg border border-[color:var(--pepe)]/50 px-3 py-2 text-xs font-bold text-[color:var(--pepe)]"
                    >
                      + Add TON prize
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Drops in this case ({c.contents.length} selected)
                  </label>
                  <input
                    value={nftQuery}
                    onChange={(e) => setNftQuery(e.target.value)}
                    placeholder="Search NFTs…"
                    className="w-40 rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-1.5 text-xs text-foreground outline-none focus:border-[color:var(--pepe)]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {CATALOG.filter((n) => n.name.toLowerCase().includes(nftQuery.trim().toLowerCase())).map((n) => {
                    const on = c.contents.some((x) => x.type === "nft" && x.id === n.id)
                    return (
                      <div
                        key={n.id}
                        className={`relative flex flex-col items-center rounded-xl border p-2 text-center transition ${
                          on
                            ? "border-[color:var(--pepe)] bg-[color:var(--pepe)]/10"
                            : "border-[color:var(--border)] opacity-60"
                        }`}
                      >
                        <button onClick={() => toggleContent(c.id, n.id)} className="flex flex-col items-center">
                          <Image src={n.img || "/placeholder.svg"} alt={n.name} width={40} height={40} className="h-10 w-10 object-contain" />
                          <span className="mt-1 truncate text-[10px] text-foreground">{n.name}</span>
                          <span className="text-[10px] text-muted-foreground">{n.price} TON</span>
                        </button>
                        <button
                          onClick={() => update(c.id, { cover: n.img })}
                          title="Use as cover"
                          className={`mt-1 w-full rounded-md py-0.5 text-[9px] font-bold ${
                            c.cover === n.img
                              ? "bg-[color:var(--pepe)] text-black"
                              : "border border-[color:var(--border)] text-muted-foreground hover:border-[color:var(--pepe)]"
                          }`}
                        >
                          {c.cover === n.img ? "Cover ✓" : "Set cover"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- PROMO CODES ---------------- */
function PromosTab({ adminId }: { adminId: string }) {
  const [promos, setPromos] = useState<PromoCodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  // New code form
  const [code, setCode] = useState("")
  const [type, setType] = useState<"ton" | "percent" | "case">("ton")
  const [reward, setReward] = useState("1")
  const [bonusPercent, setBonusPercent] = useState("10")
  const [maxUses, setMaxUses] = useState("100")

  useEffect(() => {
    loadPromos(adminId)
      .then(setPromos)
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false))
  }, [adminId])

  async function persist(next: PromoCodeItem[]) {
    setSaving(true); setError(null); setStatus(null)
    try {
      const saved = await savePromos(next, adminId)
      setPromos(saved)
      setStatus("Saved")
      setTimeout(() => setStatus(null), 2000)
    } catch (e: any) {
      setError(e.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function addCode() {
    const c = code.trim().toUpperCase()
    if (!c) { setError("Enter a code"); return }
    if (promos.some((p) => p.code === c)) { setError("Code already exists"); return }
    const next: PromoCodeItem[] = [
      {
        code: c,
        type,
        reward: type === "ton" ? Math.max(0, Number(reward) || 0) : 0,
        bonusPercent: type === "percent" ? Math.max(0, Number(bonusPercent) || 0) : 0,
        caseId: type === "case" ? "promo" : "",
        maxUses: Math.max(0, Math.floor(Number(maxUses) || 0)),
        uses: 0,
        expiresAt: null,
        active: true,
        createdAt: Date.now(),
        redeemedBy: [],
      },
      ...promos,
    ]
    setCode("")
    persist(next)
  }

  function toggleActive(c: string) {
    persist(promos.map((p) => (p.code === c ? { ...p, active: !p.active } : p)))
  }

  function remove(c: string) {
    persist(promos.filter((p) => p.code !== c))
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading promo codes…</p>

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total codes" value={String(promos.length)} />
        <Stat label="Active" value={String(promos.filter((p) => p.active).length)} />
        <Stat label="Total redemptions" value={String(promos.reduce((a, p) => a + p.uses, 0))} accent />
      </div>

      {/* Create form */}
      <div className="glass-card mb-4 rounded-2xl p-4">
        <p className="mb-3 text-sm font-bold text-foreground">Create promo code</p>

        {/* Type selector */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <button onClick={() => setType("ton")}
            className="rounded-xl py-2 text-sm font-bold transition"
            style={{
              background: type === "ton" ? "rgba(0,255,65,0.2)" : "rgba(255,255,255,0.04)",
              color: type === "ton" ? "#39FF14" : "#888",
              border: `1px solid ${type === "ton" ? "rgba(0,255,65,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>
            🪙 TON нагорода
          </button>
          <button onClick={() => setType("percent")}
            className="rounded-xl py-2 text-sm font-bold transition"
            style={{
              background: type === "percent" ? "rgba(114,137,218,0.2)" : "rgba(255,255,255,0.04)",
              color: type === "percent" ? "#7289da" : "#888",
              border: `1px solid ${type === "percent" ? "rgba(114,137,218,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>
            📈 % до депозиту
          </button>
          <button onClick={() => setType("case")}
            className="rounded-xl py-2 text-sm font-bold transition"
            style={{
              background: type === "case" ? "rgba(255,214,0,0.2)" : "rgba(255,255,255,0.04)",
              color: type === "case" ? "#ffd600" : "#888",
              border: `1px solid ${type === "case" ? "rgba(255,214,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>
            🎟️ Promo Case
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Код</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BONUS10"
              className="w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-sm font-mono uppercase text-foreground outline-none focus:border-[color:var(--pepe)]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
              {type === "ton" ? "Нагорода (TON)" : "Бонус (%)"}
            </label>
            {type === "ton" ? (
              <input type="number" min="0" step="0.1" value={reward} onChange={(e) => setReward(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-sm text-foreground outline-none focus:border-[color:var(--pepe)]" />
            ) : (
              <input type="number" min="1" max="1000" step="1" value={bonusPercent} onChange={(e) => setBonusPercent(e.target.value)}
                placeholder="10"
                className="w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-sm text-foreground outline-none focus:border-[color:var(--pepe)]" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Макс. використань (0 = ∞)</label>
            <input type="number" min="0" step="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--border)] bg-black/40 px-3 py-2 text-sm text-foreground outline-none focus:border-[color:var(--pepe)]" />
          </div>
        </div>

        {type === "percent" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Гравець вводить код → при наступному депозиті 10 TON він отримає 11 TON (+{bonusPercent || 10}% бонус)
          </p>
        )}
        {type === "case" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Гравець вводить код → одразу відкривається Promo Case (можна налаштувати призи у вкладці Cases → Promo Case)
          </p>
        )}

        <button onClick={addCode} disabled={saving}
          className="mt-3 rounded-lg bg-[color:var(--pepe)] px-4 py-2 text-sm font-bold text-black disabled:opacity-50">
          {saving ? "Saving…" : "Add code"}
        </button>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        {status && <p className="mt-2 text-xs text-[color:var(--pepe)]">{status}</p>}
      </div>

      {/* List */}
      {promos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No promo codes yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {promos.map((p) => (
            <div key={p.code} className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-black/50 px-3 py-1.5 font-mono text-sm font-bold text-[color:var(--pepe)]">
                  {p.code}
                </span>
                <div className="text-xs text-muted-foreground">
                  {p.type === "percent" ? (
                    <span className="font-semibold" style={{ color: "#7289da" }}>+{p.bonusPercent}% до депозиту</span>
                  ) : p.type === "case" ? (
                    <span className="font-semibold" style={{ color: "#ffd600" }}>🎟️ Promo Case</span>
                  ) : (
                    <span className="font-semibold text-foreground">{p.reward} TON</span>
                  )}
                  {" · "}{p.uses}/{p.maxUses === 0 ? "∞" : p.maxUses} використань
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(p.code)} disabled={saving}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${p.active
                    ? "bg-[color:var(--pepe)]/15 text-[color:var(--pepe)]"
                    : "border border-[color:var(--border)] text-muted-foreground"
                  }`}>
                  {p.active ? "Active" : "Paused"}
                </button>
                <button onClick={() => remove(p.code)} disabled={saving}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- WITHDRAWALS ---------------- */
function WithdrawalsTab({ adminId }: { adminId: string }) {
  const [items, setItems] = useState<WithdrawalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"pending" | "sent" | "all">("pending")

  function refresh() {
    loadWithdrawals(adminId)
      .then((ws) => setItems(ws.sort((a, b) => b.createdAt - a.createdAt)))
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [adminId])

  async function markSent(id: string) {
    setBusy(id)
    setError(null)
    try {
      await markWithdrawalSent(id, adminId)
      setItems((prev) => prev.map((w) => (w.id === id ? { ...w, status: "sent", sentAt: Date.now() } : w)))
    } catch (e: any) {
      setError(e.message || "Failed to update")
    } finally {
      setBusy(null)
    }
  }

  const pendingCount = items.filter((w) => w.status === "pending").length
  const sentCount = items.filter((w) => w.status === "sent").length
  const shown = items.filter((w) => (filter === "all" ? true : w.status === filter))

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading withdrawals…</p>
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Pending" value={String(pendingCount)} accent />
        <Stat label="Sent" value={String(sentCount)} />
        <Stat label="Total floor" value={`${items.reduce((a, w) => a + w.floorPrice, 0).toFixed(1)} TON`} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        {(["pending", "sent", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
              filter === f
                ? "bg-[color:var(--pepe)] text-black"
                : "border border-[color:var(--border)] text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-foreground hover:border-[color:var(--pepe)]"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-[color:var(--crimson)]">{error}</p>}

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No {filter === "all" ? "" : filter} withdrawals.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((w) => (
            <div key={w.id} className="glass-card flex items-center justify-between gap-3 rounded-2xl p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Image
                  src={w.nftImg || "/placeholder.svg"}
                  alt={w.nftName}
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full bg-transparent object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{w.nftName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{w.username} · ID {w.userId} · {w.floorPrice} TON
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {w.status === "sent" ? (
                  <span className="rounded-lg bg-[color:var(--pepe)]/15 px-3 py-1.5 text-xs font-bold text-[color:var(--pepe)]">
                    Sent
                  </span>
                ) : (
                  <button
                    onClick={() => markSent(w.id)}
                    disabled={busy === w.id}
                    className="btn-3d rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                  >
                    {busy === w.id ? "…" : "Mark sent"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- MONEY ---------------- */
function MoneyTab({ adminId }: { adminId: string }) {
  const [bets, setBets] = useState<AdminBetRow[]>([])
  const [stats, setStats] = useState({ totalWagered: 0, totalWon: 0, houseProfit: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadAdminMoney(adminId)
      .then((res) => {
        if (!active) return
        setBets(res.bets)
        setStats(res.stats)
      })
      .catch((e) => active && setError(e.message || "Failed to load money"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [adminId])

  function fmtTime(ms: number) {
    if (!ms) return "—"
    const d = new Date(ms)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading money flow…</p>
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total wagered (TON)" value={stats.totalWagered.toFixed(1)} accent />
        <Stat label="Total paid out (TON)" value={stats.totalWon.toFixed(1)} />
        <Stat label="House profit (TON)" value={stats.houseProfit.toFixed(1)} accent />
      </div>

      {error && <p className="mb-3 text-sm text-[color:var(--crimson)]">{error}</p>}

      <div className="glass-card overflow-x-auto rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--border)] text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Round</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 text-right">Bet</th>
              <th className="px-4 py-3 text-right">Result</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b) => {
              const open = b.cashedAt == null && b.won === 0
              const won = b.won > 0
              return (
                <tr key={b.id} className="border-b border-[color:var(--border)]/50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{b.roundId}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">@{b.username}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{b.amount} TON</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      won ? "text-[color:var(--pepe)]" : open ? "text-[color:var(--gold)]" : "text-[color:var(--crimson)]"
                    }`}
                  >
                    {won ? `+${b.won.toFixed(2)} (${b.cashedAt?.toFixed(2)}x)` : open ? "open" : "lost"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtTime(b.createdAt)}</td>
                </tr>
              )
            })}
            {bets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No bets recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- NFT ---------------- */
function NftTab() {
  const [items, setItems] = useState(CATALOG.map((n) => ({ id: n.id, name: n.name, rarity: n.rarity, price: n.price, img: n.img })))

  function setPrice(id: string, price: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, price } : n)))
  }

  const rarityColor: Record<Rarity, string> = {
    Common: "var(--muted-foreground)",
    Rare: "var(--pepe)",
    Epic: "var(--gold)",
    Legendary: "var(--crimson)",
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-extrabold text-foreground">NFT Catalog ({items.length})</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((n) => (
          <div key={n.id} className="glass-card flex items-center gap-3 rounded-2xl p-3">
            <Image src={n.img || "/placeholder.svg"} alt={n.name} width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{n.name}</p>
              <p className="text-[11px] font-semibold" style={{ color: rarityColor[n.rarity] }}>
                {n.rarity}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={n.price}
                  onChange={(e) => setPrice(n.id, Number(e.target.value))}
                  className="w-16 rounded-md border border-[color:var(--border)] bg-black/40 px-1.5 py-1 text-right text-xs font-bold text-[color:var(--pepe)] outline-none"
                />
                <span className="text-[11px] text-muted-foreground">TON</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- GAME ---------------- */
function GameTab({ adminId }: { adminId: string }) {
  const [rtp, setRtp] = useState(97)
  const [houseEdge, setHouseEdge] = useState(5)
  const [maxBet, setMaxBet] = useState(100)
  const [minBet, setMinBet] = useState(0.1)
  const [maxMult, setMaxMult] = useState(100)
  const [rocketSaved, setRocketSaved] = useState(false)
  const [rocketError, setRocketError] = useState<string | null>(null)
  const [rtpSaved, setRtpSaved] = useState(false)
  const [rtpError, setRtpError] = useState<string | null>(null)
  const [withdrawFee, setWithdrawFee] = useState(25)
  const [feeSaved, setFeeSaved] = useState(false)
  const [feeError, setFeeError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadWithdrawFee(adminId)
      .then((value) => active && setWithdrawFee(value))
      .catch((e) => active && setFeeError(e.message || "Failed to load fee"))
    return () => { active = false }
  }, [adminId])

  useEffect(() => {
    let active = true
    loadGlobalRtp(adminId)
      .then((value) => { if (!active) return; setRtp(Math.max(1, Math.min(99, Math.round(value)))); setRtpError(null) })
      .catch((e) => active && setRtpError(e.message || "Failed to load RTP"))
    return () => { active = false }
  }, [adminId])

  useEffect(() => {
    let active = true
    loadRocketSettings()
      .then((s) => {
        if (!active) return
        setHouseEdge(s.houseEdge)
        setMaxBet(s.maxBet)
        setMinBet(s.minBet)
        setMaxMult(s.maxMult)
        setRocketError(null)
      })
      .catch((e) => active && setRocketError(e.message || "Failed to load rocket settings"))
    return () => { active = false }
  }, [adminId])

  async function saveFee() {
    try {
      const value = await saveWithdrawFee(withdrawFee, adminId)
      setWithdrawFee(value); setFeeSaved(true); setFeeError(null)
      setTimeout(() => setFeeSaved(false), 1800)
    } catch (e: any) { setFeeError(e.message || "Failed to save fee") }
  }

  async function saveRtp() {
    try {
      const value = await saveGlobalRtp(rtp, adminId)
      setRtp(value); setRtpSaved(true); setRtpError(null)
      setTimeout(() => setRtpSaved(false), 1800)
    } catch (e: any) { setRtpError(e.message || "Failed to save RTP") }
  }

  async function saveRocket() {
    try {
      const s = await saveRocketSettingsApi({ houseEdge, maxBet, minBet, maxMult, adminId })
      setHouseEdge(s.houseEdge); setMaxBet(s.maxBet); setMinBet(s.minBet); setMaxMult(s.maxMult)
      setRocketSaved(true); setRocketError(null)
      setTimeout(() => setRocketSaved(false), 1800)
    } catch (e: any) { setRocketError(e.message || "Failed to save rocket settings") }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">RTP Settings</h2>
        <div className="glass-card space-y-5 rounded-2xl p-5">
          <Field label={`RTP: ${rtp}%`}>
            <input type="range" min={1} max={99} step={1} value={rtp}
              onChange={(e) => setRtp(Number(e.target.value))} className="w-full accent-[color:var(--pepe)]" />
          </Field>
          {rtpError && <p className="text-xs font-semibold text-[color:var(--crimson)]">{rtpError}</p>}
          <button onClick={saveRtp} className="btn-3d w-full rounded-xl py-3 text-sm font-extrabold">
            {rtpSaved ? "Saved!" : "Save RTP"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">Withdrawal Fee</h2>
        <div className="glass-card space-y-5 rounded-2xl p-5">
          <Field label={`NFT withdrawal fee: ${withdrawFee} ⭐`}>
            <input type="range" min={0} max={500} step={5} value={withdrawFee}
              onChange={(e) => setWithdrawFee(Number(e.target.value))} className="w-full accent-[color:var(--pepe)]" />
          </Field>
          <input type="number" min={0} max={10000} value={withdrawFee}
            onChange={(e) => setWithdrawFee(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="w-full rounded-xl border border-[rgba(0,255,65,0.2)] bg-black/40 px-3 py-2 text-sm font-bold text-foreground outline-none" />
          <p className="text-[11px] text-muted-foreground">Stars charged to a player when withdrawing an NFT gift to Telegram.</p>
          {feeError && <p className="text-xs font-semibold text-[color:var(--crimson)]">{feeError}</p>}
          <button onClick={saveFee} className="btn-3d w-full rounded-xl py-3 text-sm font-extrabold">
            {feeSaved ? "Saved!" : "Save fee"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">Rocket Game Settings</h2>
        <div className="glass-card space-y-5 rounded-2xl p-5">
          <Field label={`House edge: ${houseEdge}%`}>
            <input type="range" min={1} max={50} value={houseEdge}
              onChange={(e) => setHouseEdge(Number(e.target.value))} className="w-full accent-[color:var(--pepe)]" />
          </Field>
          <Field label="Max bet (TON)">
            <input type="number" value={maxBet} min={0.1} step={1}
              onChange={(e) => setMaxBet(Number(e.target.value))} className="num-input" />
          </Field>
          <Field label="Min bet (TON)">
            <input type="number" step={0.01} value={minBet} min={0.01}
              onChange={(e) => setMinBet(Number(e.target.value))} className="num-input" />
          </Field>
          <Field label="Max multiplier (x)">
            <input type="number" value={maxMult} min={2} step={1}
              onChange={(e) => setMaxMult(Number(e.target.value))} className="num-input" />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            House edge = ймовірність краш на 1.00x. Налаштування застосовуються до наступного раунду.
          </p>
          {rocketError && <p className="text-xs font-semibold text-[color:var(--crimson)]">{rocketError}</p>}
          <button onClick={saveRocket} className="btn-3d w-full rounded-xl py-3 text-sm font-extrabold">
            {rocketSaved ? "Saved!" : "Save settings"}
          </button>
        </div>
      </div>
      <style jsx>{`
        .num-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.4);
          padding: 0.65rem 1rem;
          color: var(--foreground);
          outline: none;
        }
        .num-input:focus { border-color: var(--pepe); }
      `}</style>
    </div>
  )
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

/* ---------------- REFS ---------------- */
function RefsTab({ adminId }: { adminId: string }) {
  const [referrers, setReferrers] = useState<AdminReferrerRow[]>([])
  const [stats, setStats] = useState({ totalInvited: 0, activeReferrers: 0, paidOut: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadAdminRefs(adminId)
      .then((res) => {
        if (!active) return
        setReferrers(res.referrers)
        setStats(res.stats)
      })
      .catch((e) => active && setError(e.message || "Failed to load referrals"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [adminId])

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading referrals…</p>
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total invited" value={String(stats.totalInvited)} />
        <Stat label="Active referrers" value={String(stats.activeReferrers)} />
        <Stat label="Paid out (TON)" value={stats.paidOut.toFixed(1)} accent />
      </div>
      <h2 className="mb-3 text-lg font-extrabold text-foreground">Top referrers</h2>
      {error && <p className="mb-3 text-sm text-[color:var(--crimson)]">{error}</p>}
      <div className="space-y-2">
        {referrers.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className="glass-card flex w-full items-center justify-between rounded-2xl p-3 text-left transition hover:border-[color:var(--pepe)]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--pepe)]/15 text-sm font-bold text-[color:var(--pepe)]">
                {i + 1}
              </span>
              <div className="min-w-0">
                <span className="block truncate font-bold text-foreground">@{r.username}</span>
                <span className="text-[11px] text-muted-foreground">ID {r.id}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{r.invited} invited</p>
              <p className="text-[11px] text-[color:var(--pepe)]">{r.earned.toFixed(2)} TON earned</p>
            </div>
          </button>
        ))}
        {referrers.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No referrals yet.</p>
        )}
      </div>
      {selected && <ReferrerDetailSheet uid={selected} adminId={adminId} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ReferrerDetailSheet({ uid, adminId, onClose }: { uid: string; adminId: string; onClose: () => void }) {
  const [data, setData] = useState<AdminReferrerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadAdminReferrerDetail(uid, adminId)
      .then((res) => {
        if (!active) return
        setData(res)
        setError(null)
      })
      .catch((e) => active && setError(e.message || "Failed to load referrer"))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [uid, adminId])

  function fmtDate(ms: number | null) {
    if (!ms) return "Unknown"
    const d = new Date(ms)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }

  const totalDeposited = data?.invited.reduce((sum, item) => sum + item.deposited, 0) ?? 0

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative z-10 max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border-t border-[color:var(--border)] bg-background p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Referral details</h2>
            <p className="text-xs text-muted-foreground">Referrer ID {uid}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-bold text-foreground">
            Close
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading referral details...</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-[color:var(--crimson)]">{error}</p>
        ) : data ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Stat label="Invited users" value={String(data.invited.length)} />
              <Stat label="Invited deposits" value={`${totalDeposited.toFixed(2)} TON`} />
              <Stat label="Referral earned" value={`${data.referrer.earned.toFixed(2)} TON`} accent />
            </div>
            <div className="mb-3">
              <p className="text-sm font-bold text-foreground">@{data.referrer.username}</p>
              <p className="text-xs text-muted-foreground">Total earned from referrals: {data.referrer.earned.toFixed(3)} TON</p>
            </div>
            <div className="glass-card overflow-x-auto rounded-2xl">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[color:var(--border)] text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Telegram ID</th>
                    <th className="px-4 py-3">Join date</th>
                    <th className="px-4 py-3 text-right">Deposited</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invited.map((item) => (
                    <tr key={item.id} className="border-b border-[color:var(--border)]/50 last:border-0">
                      <td className="px-4 py-3 font-semibold text-foreground">@{item.username}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.id}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(item.joinedAt)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[color:var(--pepe)]">{item.deposited.toFixed(3)} TON</td>
                    </tr>
                  ))}
                  {data.invited.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No invited users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------- UPGRADES TAB ---------------- */
function UpgradesTab({ adminId }: { adminId: string }) {
  const [logs, setLogs] = useState<UpgradeLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadUpgradeLogs(adminId, 200)
      .then((data) => { if (active) { setLogs(data); setError(null) } })
      .catch((e) => { if (active) setError(e.message || "Failed to load") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [adminId])

  function fmtDate(ms: number) {
    const d = new Date(ms)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }

  const wins = logs.filter(l => l.win).length
  const losses = logs.filter(l => !l.win).length
  const winRate = logs.length ? Math.round((wins / logs.length) * 100) : 0

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-extrabold text-foreground">⬆️ Upgrade Logs</h2>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-foreground">{logs.length}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <p className="text-2xl font-black" style={{ color: "#00ff41" }}>{wins}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Wins</p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-center">
            <p className="text-2xl font-black" style={{ color: "#ff4d6d" }}>{losses}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Losses</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-[color:var(--crimson)]">{error}</p>
      ) : logs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No upgrade attempts yet.</p>
      ) : (
        <div className="glass-card overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[color:var(--border)] text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Час</th>
                <th className="px-3 py-3">Гравець</th>
                <th className="px-3 py-3">Ставка NFT</th>
                <th className="px-3 py-3">Ціль NFT</th>
                <th className="px-3 py-3 text-center">Шанс</th>
                <th className="px-3 py-3 text-center">Результат</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-[color:var(--border)]/40 last:border-0"
                  style={{ background: l.win ? "rgba(0,255,65,0.04)" : "rgba(255,77,109,0.04)" }}
                >
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                  <td className="px-3 py-2.5 font-semibold text-foreground">@{l.username}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-foreground">{l.stakeName}</span>
                    <span className="ml-1 text-muted-foreground">({l.stakePrice} TON)</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-foreground">{l.targetName}</span>
                    <span className="ml-1 text-muted-foreground">({l.targetPrice} TON)</span>
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-foreground">{l.chance}%</td>
                  <td className="px-3 py-2.5 text-center">
                    {l.win ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "rgba(0,255,65,0.2)", color: "#00ff41" }}>
                        🟢 WIN
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "rgba(255,77,109,0.2)", color: "#ff4d6d" }}>
                        🔴 LOSS
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------- IP SEARCH ---------------- */
function IpSearchTab({ adminId }: { adminId: string }) {
  const [mode, setMode] = useState<"search" | "duplicates">("duplicates")
  const [ipQuery, setIpQuery] = useState("")
  const [searchResults, setSearchResults] = useState<IpPlayerRow[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [groups, setGroups] = useState<IpDuplicateGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsError, setGroupsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadIpDuplicates(adminId)
      .then((g) => active && setGroups(g))
      .catch((e) => active && setGroupsError(e.message || "Failed to load"))
      .finally(() => active && setGroupsLoading(false))
    return () => { active = false }
  }, [adminId])

  async function doSearch() {
    const ip = ipQuery.trim()
    if (!ip) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await searchPlayersByIp(ip, adminId)
      setSearchResults(res)
    } catch (e: any) {
      setSearchError(e.message || "Search failed")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-extrabold text-foreground">🔍 IP Search & Multi-Account Detection</h2>
      <p className="text-xs text-muted-foreground">
        IP-адреси записуються автоматично при кожному заході гравця в гру. Можна шукати конкретну IP або переглянути всі групи гравців що ділять одну й ту саму IP (ймовірна мульти-акаунтність).
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("duplicates")}
          className="rounded-xl px-4 py-2 text-sm font-bold"
          style={{
            background: mode === "duplicates" ? "var(--pepe)" : "rgba(255,255,255,0.05)",
            color: mode === "duplicates" ? "#04130a" : "#888",
          }}
        >
          ⚠️ Дублікати IP
        </button>
        <button
          onClick={() => setMode("search")}
          className="rounded-xl px-4 py-2 text-sm font-bold"
          style={{
            background: mode === "search" ? "var(--pepe)" : "rgba(255,255,255,0.05)",
            color: mode === "search" ? "#04130a" : "#888",
          }}
        >
          🔎 Пошук за IP
        </button>
      </div>

      {mode === "search" && (
        <div>
          <div className="mb-4 flex gap-2">
            <input
              value={ipQuery}
              onChange={(e) => setIpQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Введіть IP адресу, напр. 178.137.82.1"
              className="flex-1 rounded-xl border border-[color:var(--border)] bg-black/40 px-4 py-3 font-mono text-sm text-foreground outline-none focus:border-[color:var(--pepe)]"
            />
            <button
              onClick={doSearch}
              disabled={searching || !ipQuery.trim()}
              className="rounded-xl bg-[color:var(--pepe)] px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {searching ? "…" : "Знайти"}
            </button>
          </div>

          {searchError && <p className="text-sm text-red-400">{searchError}</p>}

          {searchResults && (
            searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">Гравців з цією IP не знайдено.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Знайдено {searchResults.length} гравців:</p>
                {searchResults.map((p) => <IpPlayerRowCard key={p.uid} player={p} />)}
              </div>
            )
          )}
        </div>
      )}

      {mode === "duplicates" && (
        groupsLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>
        ) : groupsError ? (
          <p className="py-10 text-center text-sm text-[color:var(--crimson)]">{groupsError}</p>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Дублікатів IP не знайдено — кожен гравець заходить з унікальної адреси.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-orange-400">
              ⚠️ Знайдено {groups.length} груп(и) де кілька акаунтів ділять одну IP
            </p>
            {groups.map((g) => (
              <div key={g.ip} className="glass-card rounded-2xl p-4" style={{ border: "1px solid rgba(255,140,30,0.3)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-lg bg-black/50 px-3 py-1.5 font-mono text-sm font-bold text-orange-400">
                    {g.ip}
                  </span>
                  <span className="text-xs text-muted-foreground">{g.players.length} акаунти</span>
                </div>
                <div className="space-y-2">
                  {g.players.map((p) => <IpPlayerRowCard key={p.uid} player={p} />)}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function IpPlayerRowCard({ player }: { player: IpPlayerRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
      {player.photo ? (
        <img src={player.photo} alt={player.name} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--pepe)]/20 text-xs font-black text-[color:var(--pepe)]">
          {player.name[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">@{player.name}</p>
        <p className="text-[11px] text-muted-foreground">ID: {player.uid} · {player.balance.toFixed(2)} TON</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-muted-foreground">Останній IP</p>
        <p className="font-mono text-xs font-bold text-foreground">{player.lastIp || "—"}</p>
      </div>
    </div>
  )
}

/* ---------------- SETTINGS ---------------- */
function SettingsTab({ adminId }: { adminId: string }) {
  const [botName, setBotName] = useState("PepeCasinoBot")
  const [treasury, setTreasury] = useState("UQAfazCyjGjugOf73_LrxUuLvxSmExM_8loArhgATwKXU6yA")
  const [maintenance, setMaintenance] = useState(false)
  const [mLoading, setMLoading] = useState(true)
  const [mSaving, setMSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Season state
  const [season, setSeason] = useState<{ index: number; startMs: number; endMs: number; endsInMs: number } | null>(null)
  const [seasonResetting, setSeasonResetting] = useState(false)
  const [seasonMsg, setSeasonMsg] = useState("")
  const [leaderboardOverrides, setLeaderboardOverrides] = useState<LeaderboardOverride[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardSaving, setLeaderboardSaving] = useState(false)
  const [leaderboardMsg, setLeaderboardMsg] = useState("")

  useEffect(() => {
    loadSeason().then(setSeason).catch(() => {})
    loadLeaderboardOverrides(adminId)
      .then(setLeaderboardOverrides)
      .catch((e) => setLeaderboardMsg("Error: " + (e?.message ?? "failed to load top-3")))
      .finally(() => setLeaderboardLoading(false))
  }, [adminId])

  async function handleResetSeason() {
    if (!confirm(`Reset leaderboard? Season ${season?.index ?? "?"} will end NOW and Season ${(season?.index ?? 0) + 1} starts fresh. All participants keep their accounts but rankings reset.`)) return
    setSeasonResetting(true)
    setSeasonMsg("")
    try {
      const res = await resetSeason(adminId)
      setSeason(res.season)
      setSeasonMsg(`✓ Season ${res.season.index} started!`)
    } catch (e: any) {
      setSeasonMsg("Error: " + (e?.message ?? "unknown"))
    } finally {
      setSeasonResetting(false)
    }
  }

  function fmtDate(ms: number) {
    return new Date(ms).toLocaleDateString("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }
  useEffect(() => {
    let active = true
    loadMaintenance()
      .then((on) => active && setMaintenance(on))
      .finally(() => active && setMLoading(false))
    return () => {
      active = false
    }
  }, [])

  // Persist the toggle immediately so it takes effect for all users.
  async function toggleMaintenance() {
    const next = !maintenance
    setMaintenance(next) // optimistic
    setMSaving(true)
    try {
      const on = await saveMaintenance(next, adminId)
      setMaintenance(on)
    } catch {
      setMaintenance(!next) // revert on failure
    } finally {
      setMSaving(false)
    }
  }

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function updateLeaderboardOverride(rank: 1 | 2 | 3, patch: Partial<LeaderboardOverride>) {
    setLeaderboardOverrides((prev) =>
      [1, 2, 3].map((r) => {
        const current = prev.find((x) => x.rank === r) || {
          rank: r as 1 | 2 | 3,
          enabled: false,
          username: "",
          photo: "",
          amount: 0,
        }
        return r === rank ? { ...current, ...patch } : current
      }),
    )
  }

  async function handleSaveLeaderboardOverrides() {
    setLeaderboardSaving(true)
    setLeaderboardMsg("")
    try {
      const saved = await saveLeaderboardOverrides(leaderboardOverrides, adminId)
      setLeaderboardOverrides(saved)
      setLeaderboardMsg("Saved top-3 overrides")
    } catch (e: any) {
      setLeaderboardMsg("Error: " + (e?.message ?? "failed to save top-3"))
    } finally {
      setLeaderboardSaving(false)
    }
  }

  async function handleResetLeaderboardOverrides() {
    if (!confirm("Reset manual leaderboard top-3 and return to automatic values?")) return
    setLeaderboardSaving(true)
    setLeaderboardMsg("")
    try {
      const reset = await resetLeaderboardOverrides(adminId)
      setLeaderboardOverrides(reset)
      setLeaderboardMsg("Manual top-3 reset")
    } catch (e: any) {
      setLeaderboardMsg("Error: " + (e?.message ?? "failed to reset top-3"))
    } finally {
      setLeaderboardSaving(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="mb-4 text-lg font-extrabold text-foreground">Bot Configuration</h2>
      <div className="glass-card space-y-5 rounded-2xl p-5">
        <Field label="Bot username">
          <input value={botName} onChange={(e) => setBotName(e.target.value)} className="cfg-input" />
        </Field>
        <Field label="Treasury wallet">
          <input value={treasury} onChange={(e) => setTreasury(e.target.value)} className="cfg-input font-mono text-xs" />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">
              Maintenance Mode {maintenance ? "ON" : "OFF"}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {maintenance ? "Only admins can access the app." : "All users can access the app."}
            </p>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={mLoading || mSaving}
            aria-pressed={maintenance}
            aria-label="Toggle maintenance mode"
            className={`h-7 w-12 shrink-0 rounded-full p-1 transition disabled:opacity-50 ${maintenance ? "bg-[color:var(--pepe)]" : "bg-white/15"}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition ${maintenance ? "translate-x-5" : ""}`} />
          </button>
        </div>
        <button onClick={save} className="btn-3d w-full rounded-xl py-3 text-sm font-extrabold">
          {saved ? "Saved!" : "Save configuration"}
        </button>
      </div>

      {/* Leaderboard season */}
      <h2 className="mb-4 mt-8 text-lg font-extrabold text-foreground">Leaderboard Season</h2>
      <div className="glass-card space-y-4 rounded-2xl p-5">
        {season ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Season</span>
              <span className="font-extrabold text-foreground">#{season.index}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="font-semibold text-foreground">{fmtDate(season.startMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ends</span>
              <span className="font-semibold text-foreground">{fmtDate(season.endMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time left</span>
              <span className="font-bold text-[color:var(--pepe)]">
                {Math.floor(season.endsInMs / 86400000)}d {Math.floor((season.endsInMs % 86400000) / 3600000)}h
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading season info…</p>
        )}
        {seasonMsg && (
          <p className={`text-sm font-semibold ${seasonMsg.startsWith("✓") ? "text-[color:var(--pepe)]" : "text-red-400"}`}>
            {seasonMsg}
          </p>
        )}
        <button
          onClick={handleResetSeason}
          disabled={seasonResetting}
          className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-extrabold text-red-400 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
        >
          {seasonResetting ? "Resetting…" : "🔄 Reset Season & Start New"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Скидає таймер і починає новий сезон прямо зараз. Учасники лишаються, але рейтинг обнуляється (депозити рахуються з нуля).
        </p>
      </div>

      <h2 className="mb-4 mt-8 text-lg font-extrabold text-foreground">Leaderboard Top-3</h2>
      <div className="glass-card space-y-4 rounded-2xl p-5">
        {leaderboardLoading ? (
          <p className="text-sm text-muted-foreground">Loading top-3 settings...</p>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3].map((rank) => {
              const item = leaderboardOverrides.find((x) => x.rank === rank) || {
                rank: rank as 1 | 2 | 3,
                enabled: false,
                username: "",
                photo: "",
                amount: 0,
              }
              return (
                <div key={rank} className="rounded-xl border border-[color:var(--border)] bg-black/30 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-extrabold text-foreground">Place #{rank}</span>
                    <button
                      onClick={() => updateLeaderboardOverride(rank as 1 | 2 | 3, { enabled: !item.enabled })}
                      aria-pressed={item.enabled}
                      className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${item.enabled ? "bg-[color:var(--pepe)]" : "bg-white/15"}`}
                    >
                      <span className={`block h-5 w-5 rounded-full bg-white transition ${item.enabled ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <input
                      value={item.username}
                      onChange={(e) => updateLeaderboardOverride(rank as 1 | 2 | 3, { username: e.target.value })}
                      placeholder="Display name"
                      className="cfg-input"
                    />
                    <input
                      value={String(item.amount)}
                      onChange={(e) => updateLeaderboardOverride(rank as 1 | 2 | 3, { amount: Number(e.target.value) || 0 })}
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="TON"
                      className="cfg-input"
                    />
                  </div>
                  <input
                    value={item.photo}
                    onChange={(e) => updateLeaderboardOverride(rank as 1 | 2 | 3, { photo: e.target.value })}
                    placeholder="Photo URL (optional)"
                    className="cfg-input mt-2"
                  />
                </div>
              )
            })}
          </div>
        )}
        {leaderboardMsg && (
          <p className={`text-sm font-semibold ${leaderboardMsg.startsWith("Error:") ? "text-red-400" : "text-[color:var(--pepe)]"}`}>
            {leaderboardMsg}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={handleSaveLeaderboardOverrides}
            disabled={leaderboardLoading || leaderboardSaving}
            className="rounded-xl bg-[color:var(--pepe)] py-3 text-sm font-extrabold text-black transition active:scale-95 disabled:opacity-50"
          >
            {leaderboardSaving ? "Saving..." : "Save top-3"}
          </button>
          <button
            onClick={handleResetLeaderboardOverrides}
            disabled={leaderboardLoading || leaderboardSaving}
            className="rounded-xl border border-[color:var(--border)] py-3 text-sm font-extrabold text-foreground transition hover:border-red-500/50 hover:text-red-400 active:scale-95 disabled:opacity-50"
          >
            Reset to automatic
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enabled manual places stay fixed above automatic deposit rankings until reset.
        </p>
      </div>
      <style jsx>{`
        .cfg-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.4);
          padding: 0.65rem 1rem;
          color: var(--foreground);
          outline: none;
        }
        .cfg-input:focus { border-color: var(--pepe); }
      `}</style>
    </div>
  )
}
