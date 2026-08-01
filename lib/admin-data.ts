// Types shared by the admin panel UI. Admin IDs live ONLY in server env
// (ADMIN_TELEGRAM_IDS) — never ship allowlists or passwords to the client.

export interface AdminPlayer {
  id: string
  username: string
  name: string
  ton: number
  nftCount: number
  refBy: string | null
  banned: boolean
}

export interface AdminBet {
  id: string
  roundId: string
  userId: string
  username: string
  amount: number
  cashedAt: number | null
  won: number
  createdAt: number
}

export interface AdminReferrer {
  id: string
  username: string
  invited: number
  earned: number
}
