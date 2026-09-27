// เสียง / สั่น / กันจอดับ สำหรับ rest timer และ interval timer
let ctx: AudioContext | null = null

/** ต้องเรียกจาก user gesture ครั้งแรก (iOS) เพื่อปลดล็อกเสียง */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* ไม่รองรับ */
  }
}

export function beep(times = 1, freq = 880, ms = 180) {
  try {
    ctx ??= new AudioContext()
    for (let i = 0; i < times; i++) {
      const t0 = ctx.currentTime + i * (ms / 1000 + 0.12)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + ms / 1000 + 0.05)
    }
  } catch {
    /* ไม่รองรับ */
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* iOS ไม่รองรับ */
  }
}

export function alertDone() {
  beep(3)
  vibrate([300, 120, 300, 120, 300])
}

type Sentinel = { release: () => Promise<void> }
let lock: Sentinel | null = null

/** กันจอดับระหว่างจับเวลา */
export async function keepAwake(on: boolean) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }
    if (on && !lock && nav.wakeLock) lock = await nav.wakeLock.request('screen')
    if (!on && lock) {
      await lock.release()
      lock = null
    }
  } catch {
    /* ไม่รองรับ */
  }
}
