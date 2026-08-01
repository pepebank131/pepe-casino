import { NextRequest } from "next/server"
import { resolveUser, getBotToken } from "@/lib/telegram-auth"

export const dynamic = "force-dynamic"

/** Authenticated photo proxy — prevents anonymous bot-file scraping. */
export async function GET(req: NextRequest) {
  const initData = req.headers.get("x-telegram-init-data") || ""
  const user = resolveUser(initData)
  if (!user) return new Response("Unauthorized", { status: 401 })

  const token = getBotToken() || ""
  const fileId = req.nextUrl.searchParams.get("file_id")
  if (!token || !fileId || fileId.length > 200) return new Response("Not found", { status: 404 })

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    })
    const fileData = await fileRes.json().catch(() => ({}))
    const filePath = fileData?.result?.file_path
    if (!fileRes.ok || !fileData.ok || !filePath) return new Response("Not found", { status: 404 })

    const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
    if (!imageRes.ok || !imageRes.body) return new Response("Not found", { status: 404 })

    return new Response(imageRes.body, {
      headers: {
        "Content-Type": imageRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (e) {
    console.error("[telegram] photo proxy error:", e)
    return new Response("Not found", { status: 404 })
  }
}
