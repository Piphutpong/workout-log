import { useEffect, useRef } from 'react'

/** แอนิเมชันฉลอง (canvas ไม่ใช้ไลบรารี) */
export function Confetti({ duration = 3500 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    resize()
    const colors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#9085e9']
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.5,
      vx: (Math.random() - 0.5) * 4 * dpr,
      vy: (2 + Math.random() * 4) * dpr,
      r: (4 + Math.random() * 5) * dpr,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }))
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const fade = Math.max(0, 1 - (t - start - duration * 0.7) / (duration * 0.3))
      ctx.globalAlpha = fade
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05 * dpr
        p.a += p.va
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.a)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
        ctx.restore()
      }
      if (t - start < duration) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" aria-hidden />
}
