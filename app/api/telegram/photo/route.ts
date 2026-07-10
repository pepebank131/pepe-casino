import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const token = process.env.BOT_TOKEN || ""
  const fileId = req.nextUrl.searchParams.get("file_id")
  if (!token || !fileId) return new Response("Not found", { status: 404 })

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
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    })
  } catch (e) {
    console.error("[telegram] photo proxy error:", e)
    return new Response("Not found", { status: 404 })
  }
}
