"use client"

import { useEffect, useState } from "react"
import { checkAdmin, isTelegram } from "@/lib/api-client"
import { AdminPanel } from "@/components/admin/admin-panel"

export function AdminGate() {
  const [adminId, setAdminId] = useState("")
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    checkAdmin()
      .then((res) => setAdminId(res.ok ? res.adminId : ""))
      .finally(() => setChecked(true))
  }, [])

  if (adminId) return <AdminPanel adminId={adminId} />

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="glass-card w-full max-w-sm rounded-3xl p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--pepe)] text-sm font-black text-black">
            A
          </span>
          <h1 className="text-xl font-extrabold text-foreground">Admin Access</h1>
        </div>
        <p className="mb-1 text-sm text-muted-foreground">
          {!checked ? "Checking access..." : isTelegram() ? "Access denied." : "Open this panel from the Telegram Mini App."}
        </p>
      </div>
    </main>
  )
}
