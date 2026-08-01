"use client"

import { useEffect, useState } from "react"
import { getInitData, isTelegram } from "@/lib/api-client"
import { AdminPanel } from "@/components/admin/admin-panel"

/**
 * Admin gate: requires a live Telegram Mini App session whose verified
 * initData belongs to an allowlisted admin (checked server-side).
 * No client-side password / admin ID list (those were the exploit).
 */
export function AdminGate() {
  const [status, setStatus] = useState<"checking" | "denied" | "ok">("checking")
  const [adminId, setAdminId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!isTelegram()) {
        if (!cancelled) {
          setStatus("denied")
          setError("Open /admin from inside the Telegram Mini App as an allowlisted admin.")
        }
        return
      }
      try {
        const res = await fetch("/api/admin/me", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": getInitData(),
          },
          body: JSON.stringify({ initData: getInitData() }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data.admin) {
          setAdminId(String(data.id))
          setStatus("ok")
        } else {
          setStatus("denied")
          setError("Access denied. Your Telegram account is not an admin.")
        }
      } catch {
        if (!cancelled) {
          setStatus("denied")
          setError("Could not verify admin session.")
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === "ok") return <AdminPanel adminId={adminId} />

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="glass-card w-full max-w-sm rounded-3xl p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--pepe)] text-sm font-black text-black">
            A
          </span>
          <h1 className="text-xl font-extrabold text-foreground">Admin Access</h1>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          {status === "checking" ? "Verifying Telegram session…" : error || "Access denied."}
        </p>
      </div>
    </main>
  )
}
