// WebAudio sound design for the casino app — every effect is synthesized on
// the fly so nothing needs to be downloaded and sounds stay tiny. All output
// is routed through a single master gain node so the mute toggle in the top
// bar (and the `enabled` flag below) silences everything instantly without
// every call site needing to check anything.

const STORAGE_KEY = "pepe_sfx_enabled"

function loadPref(): boolean {
  if (typeof window === "undefined") return true
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === null ? true : saved === "1"
  } catch {
    return true
  }
}

let enabled = loadPref()
let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = enabled ? 1 : 0
      master.connect(ctx.destination)
    }
    // Browsers suspend the context until a user gesture; resume opportunistically.
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

// Returns [context, masterDestination] together since callers always need both.
function out(): [AudioContext, GainNode] | [null, null] {
  const ac = audio()
  if (!ac || !master) return [null, null]
  return [ac, master]
}

export function isSoundEnabled() {
  return enabled
}

export function setSoundEnabled(v: boolean) {
  enabled = v
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
  } catch {}
  if (ctx && master) {
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setTargetAtTime(v ? 1 : 0, now, 0.05)
  }
}

export function toggleSound(): boolean {
  setSoundEnabled(!enabled)
  return enabled
}

// ─── Small building blocks ───────────────────────────────────────────────

// A short tone with an exponential pitch glide and a percussive envelope.
function tone(
  ac: AudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  t0: number,
  dur: number,
  vol: number,
) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(Math.max(1, freqStart), t0)
  if (freqEnd !== freqStart) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.015, dur * 0.25))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

function noiseBuffer(ac: AudioContext, duration: number): AudioBuffer {
  const sr = ac.sampleRate
  const len = Math.max(1, Math.floor(sr * duration))
  const buf = ac.createBuffer(1, len, sr)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

// A filtered burst of noise — used for whooshes, sparkle and the crash boom.
function noiseBurst(
  ac: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  vol: number,
  filterType: BiquadFilterType,
  freqStart: number,
  freqEnd: number,
  q?: number,
) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, dur)
  const filter = ac.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(Math.max(1, freqStart), t0)
  if (freqEnd !== freqStart) filter.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  if (q !== undefined) filter.Q.value = q
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(dest)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// ─── General UI feedback ─────────────────────────────────────────────────

// Very quiet tap for switching between screens/menus (bottom nav, back/forward
// between sub-screens) — meant to be barely-there, just a hint of feedback.
export function playNavTap() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  tone(ac, dest, "sine", 600, 520, ac.currentTime, 0.04, 0.022)
}

// Light tap for confirmations (placing a bet, picking a side, sell/keep).
// A soft sine "tap" rather than a square wave — square waves are rich in
// harsh harmonics and read as an unpleasant click/pop at short durations.
export function playClick() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  tone(ac, dest, "sine", 880, 740, ac.currentTime, 0.05, 0.05)
}

// Low double-tone for invalid input / insufficient balance. Triangle instead
// of sawtooth keeps it firm without sounding like a harsh buzz.
export function playError() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  tone(ac, dest, "triangle", 220, 180, t0, 0.12, 0.1)
  tone(ac, dest, "triangle", 220, 180, t0 + 0.14, 0.12, 0.1)
}

// ─── Cases: spinning reel + prize reveal ─────────────────────────────────

// Clean, soft "detent" tick for the spinning case reel — a short filtered
// noise click rather than a tone, so a rapid run of them sounds like a
// smooth ratchet slowing down instead of a cluster of pops/clicks.
export function playReelTick(intensity = 1) {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  const center = 2000 + Math.random() * 700
  const vol = 0.025 + Math.max(0, Math.min(1, intensity)) * 0.02
  noiseBurst(ac, dest, t0, 0.022, vol, "bandpass", center, center * 0.85, 6)
}

// Legacy percussive blip (originally for peg bounces in an earlier build).
// Kept for any future use, but the case reel now uses `playReelTick` above
// since this oscillator-based blip read as a harsh pop when ticks overlap.
export function playBounce(intensity = 1) {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  const base = 420 + Math.random() * 380 * Math.max(0.15, intensity)
  tone(ac, dest, "triangle", base, base * 0.6, t0, 0.08, Math.min(0.12, 0.05 + intensity * 0.06))
}

// Soft thunk when something settles — a reel stopping, a coin landing.
export function playLand() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  tone(ac, dest, "sine", 180, 90, ac.currentTime, 0.16, 0.18)
}

// Small generic win chime (a TON-only case prize, etc).
export function playWin() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const now = ac.currentTime
  ;[523.25, 659.25, 783.99].forEach((f, i) => tone(ac, dest, "sine", f, f, now + i * 0.09, 0.32, 0.16))
}

// Descending tone for a loss.
export function playLose() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  tone(ac, dest, "sawtooth", 320, 110, ac.currentTime, 0.34, 0.14)
}

type Rarity = "Common" | "Rare" | "Epic" | "Legendary"

// Prize reveal scaled to rarity: a plain chime for Common, building up to a
// full arpeggio plus a sparkle shimmer for Legendary so the best drops feel
// like a real event.
export function playReveal(rarity: Rarity = "Common") {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  if (rarity === "Legendary") {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ac, dest, "sine", f, f, t0 + i * 0.07, 0.55, 0.22))
    noiseBurst(ac, dest, t0 + 0.05, 0.6, 0.05, "highpass", 5000, 9000)
  } else if (rarity === "Epic") {
    ;[523.25, 659.25, 880].forEach((f, i) => tone(ac, dest, "sine", f, f, t0 + i * 0.08, 0.42, 0.19))
  } else if (rarity === "Rare") {
    ;[523.25, 659.25].forEach((f, i) => tone(ac, dest, "sine", f, f, t0 + i * 0.09, 0.3, 0.16))
  } else {
    tone(ac, dest, "sine", 523.25, 659.25, t0, 0.22, 0.14)
  }
}

// ─── Coin flip ────────────────────────────────────────────────────────────

// Airy whoosh while the coin tumbles.
export function playWhoosh() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  noiseBurst(ac, dest, ac.currentTime, 0.5, 0.07, "bandpass", 600, 2600)
}

// ─── Rocket crash game ────────────────────────────────────────────────────

// Rising whoosh as the round transitions from waiting to flying.
export function playLiftoff() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  noiseBurst(ac, dest, t0, 0.5, 0.12, "highpass", 400, 3000)
  tone(ac, dest, "sine", 100, 260, t0, 0.45, 0.12)
}

// Cha-ching for a successful cashout.
export function playCashout() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  ;[660, 880, 1320].forEach((f, i) => tone(ac, dest, "triangle", f, f * 1.02, t0 + i * 0.05, 0.28, 0.18))
}

// Boom for a bust.
export function playCrash() {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return
  const t0 = ac.currentTime
  tone(ac, dest, "sine", 160, 40, t0, 0.4, 0.3)
  noiseBurst(ac, dest, t0, 0.35, 0.18, "lowpass", 2200, 300)
}

// A continuous, subtly rising hum tied to the live multiplier while a round
// is flying. Call `.update(multiplier)` on every poll/tick and `.stop()`
// once the round ends (crash or cashout-for-everyone). No-ops cleanly if
// sound is off or audio isn't available.
export function startRocketHum(): { update: (mult: number) => void; stop: () => void } {
  const [ac, dest] = out()
  if (!ac || !dest || !enabled) return { update: () => {}, stop: () => {} }
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = "sine"
  o.frequency.value = 90
  g.gain.value = 0.0001
  o.connect(g).connect(dest)
  o.start()
  g.gain.setTargetAtTime(0.05, ac.currentTime, 0.2)
  return {
    update(mult: number) {
      if (!ctx) return
      const f = 90 + Math.min(420, Math.log2(Math.max(1, mult)) * 140)
      o.frequency.setTargetAtTime(f, ctx.currentTime, 0.18)
    },
    stop() {
      if (!ctx) return
      const t = ctx.currentTime
      g.gain.setTargetAtTime(0.0001, t, 0.08)
      o.stop(t + 0.3)
    },
  }
}
