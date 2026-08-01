import Image from "next/image"

// Shown to non-admin users when maintenance mode is enabled.
export function MaintenanceScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <Image
        src="/pepe-logo.png"
        alt="Pepe"
        width={160}
        height={160}
        priority
        className="h-40 w-40 object-contain drop-shadow-[0_0_30px_rgba(0,255,65,0.35)]"
      />
      <h1 className="text-pretty text-2xl font-black tracking-tight text-foreground">
        {"\u{1F527} Бот на технических работах"}
      </h1>
      <p className="max-w-sm text-pretty leading-relaxed text-muted-foreground">
        Мы обновляем систему для улучшения вашего опыта. Пожалуйста, зайдите позже!
      </p>
    </main>
  )
}
