"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useStore, type InventoryItem } from "@/lib/store"
import { useToast } from "@/components/toast"
import { requestWithdrawal, isTelegram, payWithStars, loadWithdrawFee } from "@/lib/api-client"
import { RARITY } from "@/lib/casino-data"
import { RarityBadge } from "@/components/rarity-badge"
import { TonIcon, StarIcon, GiftIcon, CheckIcon } from "@/components/icons"
import { useT } from "@/lib/i18n"

const DEFAULT_WITHDRAW_FEE = 25 // Telegram Stars, overridden by admin config
const SENDER_BOT_URL = "https://t.me/Pepe_sender"

export function ProfileScreen({ onDeposit }: { onDeposit: () => void }) {
  const { username, tgId, ton, inventory, photoUrl, addTon, removeFromInventory } = useStore()
  const toast = useToast()
  const [withdrawItem, setWithdrawItem] = useState<InventoryItem | null>(null)
  const [withdrawFee, setWithdrawFee] = useState(DEFAULT_WITHDRAW_FEE)
  const [showContact, setShowContact] = useState(false)

  useEffect(() => {
    let active = true
    loadWithdrawFee()
      .then((fee) => active && setWithdrawFee(fee))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const invValue = inventory.reduce((s, n) => s + n.price, 0)
  const initial = (username || "P").charAt(0).toUpperCase()

  function sell(item: InventoryItem) {
    if (item.withdrawing) return
    addTon(item.price)
    removeFromInventory(item.uid)
    toast(`Sold ${item.name} for ${item.price} TON`, "win")
  }

  return (
    <div className="px-4 pb-28 pt-2">
      {/* header card */}
      <div className="glass-card mb-4 flex items-center gap-4 rounded-2xl p-4">
        <span
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-2xl font-black"
          style={{
            background: "radial-gradient(circle at 35% 25%, #39FF14, #00a52c)",
            color: "#04130a",
            boxShadow: "0 0 18px rgba(0,255,65,0.6)",
          }}
        >
          {photoUrl ? (
            <Image src={photoUrl || "/placeholder.svg"} alt={username} width={64} height={64} className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div>
          <h2 className="text-lg font-extrabold">@{username}</h2>
          <p className="text-xs text-muted-foreground">Telegram ID: {tgId}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-pepe-light">
            <GiftIcon className="h-3.5 w-3.5" /> {inventory.length} gifts · {invValue.toFixed(1)} TON value
          </p>
        </div>
      </div>

      {/* balance card */}
      <div className="mb-4 glass-card flex items-center justify-between rounded-2xl p-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">TON Balance</p>
          <p className="text-3xl font-black tabular-nums">{ton.toFixed(2)}</p>
        </div>
        <TonIcon className="h-10 w-10" />
      </div>

      {/* deposit action */}
      <button
        onClick={onDeposit}
        className="btn-3d mb-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold"
      >
        <TonIcon className="h-5 w-5" /> Deposit
      </button>
      <p className="mb-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <GiftIcon className="h-3.5 w-3.5 text-pepe-light" />
        Withdrawals are NFT gifts sent to your Telegram ({withdrawFee} Stars each)
      </p>

      {/* inventory */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-extrabold">My Inventory</h3>
        <span className="text-xs font-semibold text-muted-foreground">{inventory.length} items</span>
      </div>
      {inventory.length === 0 ? (
        <div className="glass-card flex flex-col items-center rounded-2xl py-10 text-center">
          <GiftIcon className="mb-2 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No gifts yet. Open a case to win NFTs!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {inventory.map((n) => {
            const r = RARITY[n.rarity]
            return (
              <div
                key={n.uid}
                className="flex flex-col items-center rounded-2xl bg-transparent p-2.5"
                style={{ border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Image
                  src={n.img || "/placeholder.svg"}
                  alt={n.name}
                  width={72}
                  height={72}
                  className="h-[72px] w-[72px] rounded-xl bg-transparent object-cover"
                  style={{ filter: `drop-shadow(0 4px 12px ${r.glow})` }}
                />
                <span className="mt-1 max-w-full truncate text-[11px] font-bold">{n.name}</span>
                <span className="my-1">
                  <RarityBadge rarity={n.rarity} />
                </span>
                <span className="mb-2 flex items-center gap-1 text-xs font-bold">
                  <TonIcon className="h-3 w-3" /> {n.price}
                </span>

                {n.withdrawing ? (
                  <span className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(255,214,0,0.3)] bg-[rgba(255,214,0,0.08)] py-2 text-[11px] font-bold text-gold">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
                    Withdrawing…
                  </span>
                ) : (
                  <div className="flex w-full gap-1.5">
                    <button
                      onClick={() => setWithdrawItem(n)}
                      className="flex-1 rounded-xl border border-[rgba(0,255,65,0.3)] bg-[rgba(0,255,65,0.08)] py-2 text-[11px] font-extrabold text-pepe-light active:scale-95"
                    >
                      Withdraw
                    </button>
                    <button
                      onClick={() => sell(n)}
                      className="flex-1 rounded-xl border border-white/10 bg-black/40 py-2 text-[11px] font-bold text-muted-foreground active:scale-95"
                    >
                      Sell
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {withdrawItem && (
        <WithdrawSheet
          item={withdrawItem}
          fee={withdrawFee}
          onClose={() => setWithdrawItem(null)}
          onSuccess={() => {
            setWithdrawItem(null)
            setShowContact(true)
          }}
        />
      )}
      {showContact && <ContactSenderModal onClose={() => setShowContact(false)} />}
    </div>
  )
}

function ContactSenderModal({ onClose }: { onClose: () => void }) {
  const { t } = useT()

  function openChat() {
    try {
      const tg = (window as any)?.Telegram?.WebApp
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(SENDER_BOT_URL)
        return
      }
    } catch {}
    window.open(SENDER_BOT_URL, "_blank")
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[380px] rounded-3xl p-6 text-center"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          border: "1px solid rgba(0,255,65,0.35)",
          boxShadow: "0 20px 60px rgba(0,255,65,0.18)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "rgba(0,255,65,0.12)", border: "1px solid rgba(0,255,65,0.3)" }}
        >
          <GiftIcon className="h-8 w-8 text-pepe-light" />
        </div>
        <h2 className="mb-2 text-lg font-extrabold">{t("withdraw.contactTitle")}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{t("withdraw.contactDesc")}</p>

        <button onClick={openChat} className="btn-3d mb-3 w-full rounded-2xl py-3.5 text-sm font-extrabold">
          {t("withdraw.openChat")}
        </button>

        <button
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(0,255,65,0.3)] bg-black/30 py-3.5 text-sm font-extrabold text-pepe-light active:scale-[0.98]"
        >
          <CheckIcon className="h-4 w-4" />
          {t("withdraw.iWrote")}
        </button>
      </div>
    </div>
  )
}

function WithdrawSheet({ item, fee, onClose, onSuccess }: { item: InventoryItem; fee: number; onClose: () => void; onSuccess: () => void }) {
  const { markWithdrawing } = useStore()
  const toast = useToast()
  const r = RARITY[item.rarity]
  const [sending, setSending] = useState(false)

  async function confirm() {
    setSending(true)
    try {
      // Inside Telegram: charge the real Stars fee, then register the request.
      if (isTelegram()) {
        const status = await payWithStars({
          stars: fee,
          title: "NFT Withdrawal",
          description: `Withdraw ${item.name} to your Telegram`,
          kind: "withdraw",
          nftId: item.id,
        })
        if (status !== "paid") {
          if (status === "cancelled") toast("Payment cancelled", "info")
          else toast("Payment failed, try again", "error")
          setSending(false)
          return
        }
        // Create the pending withdrawal request (notifies admin server-side).
        await requestWithdrawal({
          nftUid: item.uid,
          nftId: item.id,
          nftName: item.name,
          nftImg: item.img,
          floorPrice: item.price,
        })
      }

      // Lock the item locally as "Withdrawing…" until an admin marks it sent.
      // In demo/preview mode we skip the real payment + persistence.
      markWithdrawing(item.uid)
      toast(`Withdrawal requested — paid ${fee} Stars`, "win")
      onSuccess()
    } catch (e) {
      console.error("[v0] withdrawal request failed:", e)
      toast("Withdrawal failed, try again", "error")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 w-full max-w-[480px] rounded-t-3xl p-5 pb-8"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(0,255,65,0.4)",
          boxShadow: "0 -10px 40px rgba(0,255,65,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20" />
        <h2 className="mb-4 text-center text-lg font-extrabold">Withdraw NFT</h2>

        <div className="mb-4 flex flex-col items-center">
          <Image
            src={item.img || "/placeholder.svg"}
            alt={item.name}
            width={96}
            height={96}
            className="h-24 w-24 rounded-2xl bg-transparent object-cover"
            style={{ filter: `drop-shadow(0 6px 18px ${r.glow})` }}
          />
          <h3 className="mt-2 text-lg font-extrabold">{item.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <RarityBadge rarity={item.rarity} />
            <span className="flex items-center gap-1 text-sm font-bold">
              <TonIcon className="h-4 w-4" /> {item.price} floor
            </span>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-[rgba(0,255,65,0.2)] bg-black/40 p-4">
          <Row label="Floor price">
            <span className="flex items-center gap-1 font-bold">
              <TonIcon className="h-4 w-4" /> {item.price} TON
            </span>
          </Row>
          <Row label="Service fee">
            <span className="flex items-center gap-1 font-bold text-gold">
              <StarIcon className="h-4 w-4 text-gold" /> {fee} Stars
            </span>
          </Row>
          <Row label="Delivery">
            <span className="font-bold text-pepe-light">Telegram gift</span>
          </Row>
        </div>

        <button
          onClick={confirm}
          disabled={sending}
          className="btn-3d flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-70"
        >
          <StarIcon className="h-5 w-5" />
          {sending ? "Processing…" : `Pay ${fee} Stars to withdraw`}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border border-[rgba(0,255,65,0.2)] bg-black/30 py-3 text-sm font-bold text-muted-foreground active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
