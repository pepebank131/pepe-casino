"use client"

import { RARITY, type Rarity } from "@/lib/casino-data"
import { useT } from "@/lib/i18n"

export function RarityBadge({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const r = RARITY[rarity]
  const { t } = useT()
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
      style={{
        color: r.color,
        background: `${r.color}1f`,
        border: `1px solid ${r.color}55`,
      }}
    >
      {t(`rarity.${rarity}`)}
    </span>
  )
}
