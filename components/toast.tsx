"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface Toast {
  id: number
  msg: string
  tone: "win" | "info" | "error"
}

const Ctx = createContext<(msg: string, tone?: Toast["tone"]) => void>(() => {})

let tid = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((msg: string, tone: Toast["tone"] = "info") => {
    const id = tid++
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-in fade-in slide-in-from-top-2 rounded-2xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur-md"
            style={{
              background:
                t.tone === "win"
                  ? "linear-gradient(180deg,#0aff45,#00a52c)"
                  : t.tone === "error"
                    ? "linear-gradient(180deg,#ff6b81,#c81e3a)"
                    : "rgba(11,15,18,0.92)",
              color: t.tone === "info" ? "#eafff0" : "#04130a",
              border: t.tone === "info" ? "1px solid rgba(0,255,65,0.3)" : "none",
              boxShadow:
                t.tone === "win"
                  ? "0 0 24px rgba(0,255,65,0.6)"
                  : "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
