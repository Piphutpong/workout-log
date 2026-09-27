import { useEffect, useRef, useState } from 'react'
import { Button, ErrorBox, Input } from '@/components/ui'
import { Modal } from '@/components/overlay'
import type { FoodDraft } from './FoodForm'

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

/** สแกนบาร์โค้ดด้วยกล้อง: BarcodeDetector (Chrome/Android) → fallback ZXing (iPhone ฯลฯ) */
export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<unknown>(null)
  const [manual, setManual] = useState('')
  const done = useRef(false)
  const cb = useRef(onCode)
  cb.current = onCode

  useEffect(() => {
    let stop = () => {}
    const found = (code: string) => {
      if (done.current) return
      done.current = true
      navigator.vibrate?.(80)
      cb.current(code)
    }
    void (async () => {
      try {
        const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
        if (W.BarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          const v = video.current!
          v.srcObject = stream
          await v.play()
          const det = new W.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
          let alive = true
          stop = () => {
            alive = false
            stream.getTracks().forEach((t) => t.stop())
          }
          const tick = async () => {
            if (!alive || done.current) return
            try {
              const codes = await det.detect(v)
              if (codes[0]?.rawValue) return found(codes[0].rawValue)
            } catch {
              /* frame ยังไม่พร้อม */
            }
            setTimeout(tick, 250)
          }
          void tick()
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const reader = new BrowserMultiFormatReader()
          const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (res) => {
            if (res) found(res.getText())
          })
          stop = () => controls.stop()
        }
      } catch (e) {
        setError(new Error(`เปิดกล้องไม่ได้: ${(e as Error).message} — พิมพ์รหัสบาร์โค้ดด้านล่างแทนได้`))
      }
    })()
    return () => stop()
  }, [])

  return (
    <Modal open onClose={onClose} title="สแกนบาร์โค้ด">
      <video ref={video} playsInline muted className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
      <p className="mt-2 text-center text-sm text-slate-500">เล็งบาร์โค้ดให้อยู่กลางกรอบ</p>
      <ErrorBox error={error} />
      <div className="mt-3 flex gap-2">
        <Input className="flex-1" inputMode="numeric" placeholder="หรือพิมพ์รหัส" value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button disabled={manual.trim().length < 6} onClick={() => onCode(manual.trim())}>ค้นหา</Button>
      </div>
    </Modal>
  )
}

/** ดึงข้อมูลจาก Open Food Facts (ฟรี ไม่ต้องใช้ key) คืน draft สำหรับ FoodForm หรือ null ถ้าไม่พบ */
export async function lookupOpenFoodFacts(code: string): Promise<FoodDraft | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_th,product_name_en,brands,serving_size,serving_quantity,nutriments,categories`
  const res = await fetch(url)
  if (!res.ok) return null
  const j = await res.json() as { status: number; product?: Record<string, unknown> & { nutriments?: Record<string, number> } }
  if (j.status !== 1 || !j.product) return null
  const p = j.product
  const n = p.nutriments ?? {}
  const hasServing = n['energy-kcal_serving'] != null && Number(p.serving_quantity) > 0
  const pick = (k: string) => {
    const v = hasServing ? n[`${k}_serving`] : n[`${k}_100g`]
    return v == null ? null : Math.round(Number(v) * 10) / 10
  }
  const sodium = pick('sodium')
  return {
    name: String(p.product_name_th || p.product_name || p.product_name_en || `สินค้า ${code}`),
    name_en: p.product_name_en ? String(p.product_name_en) : null,
    brand: p.brands ? String(p.brands).split(',')[0] : null,
    serving_desc: hasServing ? String(p.serving_size ?? `${p.serving_quantity} g`) : '100 g',
    serving_g: hasServing ? Number(p.serving_quantity) : 100,
    calories: pick('energy-kcal') ?? 0,
    protein_g: pick('proteins') ?? 0,
    carb_g: pick('carbohydrates') ?? 0,
    fat_g: pick('fat') ?? 0,
    fiber_g: pick('fiber'),
    sodium_mg: sodium == null ? null : Math.round(sodium * 1000),
    barcode: code,
    source: 'barcode',
    is_estimate: false,
  }
}
