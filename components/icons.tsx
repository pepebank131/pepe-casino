import type { SVGProps } from "react"

type P = SVGProps<SVGSVGElement>

export function TonIcon(props: P) {
  return (
    <svg viewBox="0 0 56 56" fill="none" {...props}>
      <circle cx="28" cy="28" r="28" fill="#0098EA" />
      <path
        d="M37.6 16H18.4c-3.5 0-5.8 3.8-4 6.9l11.7 20.3c.8 1.3 2.7 1.3 3.5 0l11.7-20.3c1.8-3.1-.4-6.9-3.7-6.9Zm-11.9 19.9-2.6-4.9-6.1-11c-.4-.7.1-1.6 1-1.6h7.7v17.5Zm14.4-15.9-6.1 11-2.6 4.9V18.4h7.7c.9 0 1.4.9 1 1.6Z"
        fill="#fff"
      />
    </svg>
  )
}

export function StarIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="m12 2 2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2Z" />
    </svg>
  )
}

export function HomeIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

export function UserIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function CaseIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M3 13h18M12 8v13" />
      <path d="M7 8 9 4h6l2 4" />
    </svg>
  )
}

export function UsersIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M21 20c0-2.4-1.3-4.5-3.3-5.4" />
    </svg>
  )
}

export function RocketIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 0Z" />
      <path d="M12 15 9 12c.5-3 2-6 6-9 3 0 5 2 5 5-3 4-6 5.5-9 6Z" />
      <path d="M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    </svg>
  )
}

export function CopyIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export function PlusIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CoinIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
    </svg>
  )
}

export function GiftIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9h14v-9M12 8v13" />
      <path d="M12 8S10.5 3 8 3a2 2 0 0 0 0 4M12 8s1.5-5 4-5a2 2 0 0 1 0 4" />
    </svg>
  )
}

export function TrophyIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 4h12v4a6 6 0 0 1-12 0z" />
      <path d="M6 6H4a2 2 0 0 0 2 2M18 6h2a2 2 0 0 1-2 2M9 18h6M10 14v4M14 14v4M8 21h8" />
    </svg>
  )
}

export function SettingsIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2" />
    </svg>
  )
}

export function UpgradeIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function CheckIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

export function ChevronLeftIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export function SoundOnIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a9 9 0 0 1 0 12" />
    </svg>
  )
}

export function SoundOffIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

