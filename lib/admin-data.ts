// NOTE: All admin panel data is now read live from the shared bot PostgreSQL
// database via /lib/admin-stats-store.ts and the /api/admin/* routes. There is
// no mock/seed data — players, balances, bet history, withdrawals and referral
// earnings all come straight from the `players`, `rocket_bet` and `withdrawals`
// tables. The client-facing types live here so both the API and the panel can
// share them.

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
