import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Button, ErrorBox, Input } from '@/components/ui'
import { Modal } from '@/components/overlay'
import type { Food } from '@/types/database'
import { nk } from './api'

export type FoodDraft = Partial<Omit<Food, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { id?: string }

const NUM_FIELDS = [
  ['calories', 'แคลอรี่ (kcal)'], ['protein_g', 'โปรตีน (g)'], ['carb_g', 'คาร์บ (g)'], ['fat_g', 'ไขมัน (g)'],
  ['fiber_g', 'ใยอาหาร (g)'], ['sodium_mg', 'โซเดียม (mg)'], ['serving_g', 'น้ำหนัก/หน่วย (g)'],
] as const

/** สร้าง/แก้อาหารในคลัง คืนอาหารที่บันทึกแล้วผ่าน onSaved */
export function FoodForm({ initial, onClose, onSaved }: { initial: FoodDraft; onClose: () => void; onSaved?: (f: Food) => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Record<string, string>>(() => ({
    name: initial.name ?? '', name_en: initial.name_en ?? '', brand: initial.brand ?? '', serving_desc: initial.serving_desc ?? '1 ที่',
    category: initial.category ?? '', barcode: initial.barcode ?? '',
    ...Object.fromEntries(NUM_FIELDS.map(([k]) => [k, initial[k] != null ? String(initial[k]) : ''])),
  }))
  const [estimate, setEstimate] = useState(initial.is_estimate ?? false)
  const [favorite, setFavorite] = useState(initial.is_favorite ?? false)
  const [error, setError] = useState<unknown>(null)
  const num = (k: string) => (f[k]?.trim() ? Number(f[k]) : null)

  const save = async () => {
    setError(null)
    try {
      if (!f.name.trim()) throw new Error('กรอกชื่ออาหาร')
      if (num('calories') == null) throw new Error('กรอกแคลอรี่')
      for (const [k, l] of NUM_FIELDS) if (f[k]?.trim() && Number.isNaN(Number(f[k]))) throw new Error(`${l} ต้องเป็นตัวเลข`)
      const row = {
        name: f.name.trim(), name_en: f.name_en || null, brand: f.brand || null, serving_desc: f.serving_desc || '1 ที่',
        serving_g: num('serving_g'), calories: num('calories') ?? 0, protein_g: num('protein_g') ?? 0, carb_g: num('carb_g') ?? 0,
        fat_g: num('fat_g') ?? 0, fiber_g: num('fiber_g'), sodium_mg: num('sodium_mg'), category: f.category || null,
        barcode: f.barcode || null, is_estimate: estimate, is_favorite: favorite,
      }
      let saved: Food
      if (initial.id) {
        await updateRows('foods', [initial.id], row)
        saved = { ...(initial as Food), ...row }
      } else {
        const res = await upsertRows('foods', [{ ...row, source: initial.source ?? 'manual' }])
        saved = { ...row, id: res.ids[0], source: initial.source ?? 'manual' } as Food
        qc.setQueryData<Food[]>(nk.foods, (old = []) => [...old, saved])
      }
      await qc.invalidateQueries({ queryKey: nk.foods })
      onSaved?.(saved)
      onClose()
    } catch (e) {
      setError(e)
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open onClose={onClose} title={initial.id ? 'แก้อาหาร' : 'อาหารใหม่'}
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={save}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อ" value={f.name} onChange={set('name')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ชื่ออังกฤษ" value={f.name_en} onChange={set('name_en')} />
          <Input label="ยี่ห้อ" value={f.brand} onChange={set('brand')} />
          <Input label="หน่วยบริโภค" hint="เช่น 1 จาน, 100 g" value={f.serving_desc} onChange={set('serving_desc')} />
          <Input label="หมวด" value={f.category} onChange={set('category')} />
          {NUM_FIELDS.map(([k, l]) => <Input key={k} label={l} inputMode="decimal" value={f[k]} onChange={set(k)} />)}
          <Input label="บาร์โค้ด" inputMode="numeric" value={f.barcode} onChange={set('barcode')} />
        </div>
        <p className="text-xs text-slate-500">ค่าทั้งหมดต่อ 1 หน่วยบริโภค</p>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={estimate} onChange={(e) => setEstimate(e.target.checked)} /> เป็นค่าประมาณ</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> รายการโปรด ⭐</label>
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}
