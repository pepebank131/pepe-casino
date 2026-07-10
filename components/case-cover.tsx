"use client"

// Pure CSS/box-shadow treasure-chest art used as case covers, replacing the
// old NFT photos. Each tier gets its own metal palette + glow color so the
// cases read as distinct loot boxes at a glance.

type TierKey = "starter" | "bronze" | "silver" | "gold" | "diamond" | "legendary"

interface Tier {
  glow: string // outer aura color
  lid: string // chest lid gradient
  body: string // chest body gradient
  band: string // metal trim / bands
  gem: string // lock gem highlight
  rim: string // edge highlight
}

const TIERS: Record<TierKey, Tier> = {
  starter: {
    glow: "rgba(0,255,65,0.55)",
    lid: "linear-gradient(180deg,#1f7a3a,#0d4f23)",
    body: "linear-gradient(180deg,#176b32,#0a3d1c)",
    band: "linear-gradient(180deg,#5dffa0,#1f9d52)",
    gem: "#9dffc4",
    rim: "rgba(157,255,196,0.9)",
  },
  bronze: {
    glow: "rgba(255,140,40,0.55)",
    lid: "linear-gradient(180deg,#b5722e,#7a4517)",
    body: "linear-gradient(180deg,#9c5f24,#5e370f)",
    band: "linear-gradient(180deg,#ffba6e,#c4742b)",
    gem: "#ffcf8f",
    rim: "rgba(255,186,110,0.9)",
  },
  silver: {
    glow: "rgba(220,235,255,0.6)",
    lid: "linear-gradient(180deg,#cdd6e0,#8c97a6)",
    body: "linear-gradient(180deg,#aab4c2,#6b7585)",
    band: "linear-gradient(180deg,#ffffff,#b9c4d2)",
    gem: "#ffffff",
    rim: "rgba(255,255,255,0.95)",
  },
  gold: {
    glow: "rgba(255,205,40,0.6)",
    lid: "linear-gradient(180deg,#ffd24a,#c8920f)",
    body: "linear-gradient(180deg,#e6ad1f,#9c6c06)",
    band: "linear-gradient(180deg,#fff0a8,#e0a818)",
    gem: "#fff3b0",
    rim: "rgba(255,240,168,0.95)",
  },
  diamond: {
    glow: "rgba(40,210,255,0.6)",
    lid: "linear-gradient(180deg,#56d8ff,#1690bd)",
    body: "linear-gradient(180deg,#33b6e6,#0d6f95)",
    band: "linear-gradient(180deg,#c4f4ff,#3fc3ee)",
    gem: "#d4f6ff",
    rim: "rgba(196,244,255,0.95)",
  },
  legendary: {
    glow: "rgba(214,60,255,0.6)",
    lid: "linear-gradient(180deg,#d36bff,#8e1fc4)",
    body: "linear-gradient(180deg,#b443e6,#6a1296)",
    band: "linear-gradient(180deg,#f3b4ff,#c44ff0)",
    gem: "#f3c4ff",
    rim: "rgba(243,180,255,0.95)",
  },
}

// Map a case id to its visual tier; admin-added/unknown ids fall back to starter.
function tierForCase(id: string): TierKey {
  if (id in TIERS) return id as TierKey
  if (id.includes("legend")) return "legendary"
  if (id.includes("diamond")) return "diamond"
  if (id.includes("gold")) return "gold"
  if (id.includes("silver")) return "silver"
  if (id.includes("bronze")) return "bronze"
  return "starter"
}

export function CaseCover({ caseId, size = 80 }: { caseId: string; size?: number }) {
  const tier = TIERS[tierForCase(caseId)]
  const s = size
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: s, height: s }}
      aria-hidden="true"
    >
      {/* aura */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${tier.glow}, transparent 70%)`,
          filter: "blur(2px)",
        }}
      />
      {/* chest */}
      <div className="relative" style={{ width: s * 0.82, height: s * 0.72 }}>
        {/* lid */}
        <div
          className="absolute left-0 top-0 w-full"
          style={{
            height: "44%",
            background: tier.lid,
            borderRadius: `${s * 0.16}px ${s * 0.16}px ${s * 0.05}px ${s * 0.05}px`,
            boxShadow: `inset 0 ${s * 0.04}px ${s * 0.04}px ${tier.rim}, inset 0 -2px 4px rgba(0,0,0,0.4), 0 0 ${s * 0.28}px ${tier.glow}`,
            border: "1px solid rgba(0,0,0,0.35)",
          }}
        >
          {/* lid band */}
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ width: "20%", height: "100%", background: tier.band, opacity: 0.85 }}
          />
        </div>
        {/* body */}
        <div
          className="absolute left-0 w-full"
          style={{
            top: "40%",
            height: "60%",
            background: tier.body,
            borderRadius: `${s * 0.04}px ${s * 0.04}px ${s * 0.07}px ${s * 0.07}px`,
            boxShadow: `inset 0 2px 3px ${tier.rim}, inset 0 -${s * 0.05}px ${s * 0.06}px rgba(0,0,0,0.5)`,
            border: "1px solid rgba(0,0,0,0.4)",
          }}
        >
          {/* vertical band */}
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ width: "20%", height: "100%", background: tier.band, opacity: 0.8 }}
          />
          {/* horizontal trim where lid meets body */}
          <div
            className="absolute left-0 top-0 w-full"
            style={{ height: `${s * 0.07}px`, background: tier.band, opacity: 0.9 }}
          />
        </div>
        {/* lock gem */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-sm"
          style={{
            top: "42%",
            width: `${s * 0.16}px`,
            height: `${s * 0.16}px`,
            background: `radial-gradient(circle at 35% 30%, #fff, ${tier.gem})`,
            boxShadow: `0 0 ${s * 0.12}px ${tier.glow}`,
            border: "1px solid rgba(0,0,0,0.4)",
            transform: "translateX(-50%) rotate(45deg)",
          }}
        />
      </div>
    </div>
  )
}
