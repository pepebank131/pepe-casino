import { NextRequest } from "next/server"
import { authPlayer, unauthorized } from "@/lib/api-helpers"
import { openCaseServer } from "@/lib/player-economy"

export const dynamic = "force-dynamic"

// POST /api/cases/open — server-authoritative case open (debit + RNG + credit).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const user = await authPlayer(req, body.initData)
  if (!user) return unauthorized()

  const caseId = String(body.caseId || "")
  if (!caseId) return Response.json({ error: "missing caseId" }, { status: 400 })

  try {
    const result = await openCaseServer(user, caseId, {
      kind: body.kind,
      promoToken: body.promoToken ? String(body.promoToken) : undefined,
    })
    const winner =
      result.winner.type === "ton"
        ? { type: "ton" as const, amount: result.winner.amount }
        : {
            type: "nft" as const,
            nft: {
              id: result.winner.nft.id,
              name: result.winner.nft.name,
              rarity: result.winner.nft.rarity,
              price: result.winner.nft.price,
              img: result.winner.nft.img,
            },
          }
    return Response.json({
      winner,
      inventoryItem: result.inventoryItem || null,
      ton: result.ton,
      freeCaseAt: result.freeCaseAt,
      depositCaseAt: result.depositCaseAt,
      depositedSinceOpen: result.depositedSinceOpen,
      referralCaseAt: result.referralCaseAt,
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    const map: Record<string, number> = {
      insufficient_balance: 400,
      cooldown: 429,
      deposit_required: 400,
      referral_required: 400,
      promo_required: 400,
      case_not_found: 404,
      banned: 403,
    }
    const status = map[msg] || 500
    if (status === 500) console.error("[v0] cases/open error:", e)
    return Response.json({ error: msg }, { status })
  }
}
