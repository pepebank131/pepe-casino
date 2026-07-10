"use client"

import { useEffect, useState, type ReactNode } from "react"
import { TonConnectUIProvider } from "@tonconnect/ui-react"

export function TonProvider({ children }: { children: ReactNode }) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null)

  useEffect(() => {
    setManifestUrl(`${window.location.origin}/tonconnect-manifest.json`)
  }, [])

  // Wait until we know the origin so the provider always wraps the tree
  // (children that call useTonConnectUI must be inside the provider).
  if (!manifestUrl) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      actionsConfiguration={{ twaReturnUrl: "https://t.me/Pepe_GiftsBot" }}
    >
      {children}
    </TonConnectUIProvider>
  )
}

// Casino treasury wallet that receives TON deposits.
export const TREASURY_WALLET = "UQAfazCyjGjugOf73_LrxUuLvxSmExM_8loArhgATwKXU6yA"
