"use client"

import Image from "next/image"
import type { InventoryItem } from "@/lib/store"
import { TonIcon } from "@/components/icons"
import { useT } from "@/lib/i18n"

// A bottom-up grid that lets the player pick one NFT from their inventory to
// stake in a game. Items pending withdrawal can't be selected.
export function NftPicker({
  inventory,
  selectedUid,
  onSelect,
}: {
  inventory: InventoryItem[]
  selectedUid: string | null
  onSelect: (item: InventoryItem | null) => void
}) {
  const { t } = useT()
  const usable = inventory.filter((i) => !i.withdrawing)

  if (usable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] py-5 text-center text-xs font-semibold text-muted-foreground">
        {t("nft.empty")}
      </div>
    )
  }

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {usable.map((item) => {
        const active = item.uid === selectedUid
        return (
          <button
            key={item.uid}
            onClick={() => onSelect(active ? null : item)}
            className="relative shrink-0 rounded-xl p-2 text-center transition active:scale-95"
            style={{
              width: 84,
              background: active ? "rgba(0,255,65,0.14)" : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${active ? "var(--pepe)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: active ? "0 0 16px rgba(0,255,65,0.35)" : "none",
            }}
          >
            <Image
              src={item.img || "/placeholder.svg"}
              alt={item.name}
              width={56}
              height={56}
              className="mx-auto h-14 w-14 rounded-lg object-contain"
            />
            <span className="mt-1 flex items-center justify-center gap-0.5 text-[11px] font-bold tabular-nums text-pepe-light">
              <TonIcon className="h-2.5 w-2.5" />
              {item.price.toFixed(2)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
