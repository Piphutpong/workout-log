import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { deleteRows } from '@/lib/offline/queue'
import { Badge, Button, Empty, Input, PageTitle, Spinner, cx } from '@/components/ui'
import { confirmDialog, toast } from '@/components/overlay'
import type { Food } from '@/types/database'
import { nk, useFoods } from './api'
import { BarcodeScanner, lookupOpenFoodFacts } from './BarcodeScanner'
import { FoodForm, type FoodDraft } from './FoodForm'

export function FoodsPage() {
  const qc = useQueryClient()
  const foods = useFoods()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const [scan, setScan] = useState(false)

  const cats = useMemo(() => [...new Set((foods.data ?? []).map((f) => f.category).filter(Boolean))] as string[], [foods.data])
  const list = (foods.data ?? []).filter((f) =>
    (!cat || f.category === cat) &&
    (!q.trim() || [f.name, f.name_en, f.brand].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase()))))

  const remove = async (f: Food) => {
    if (!(await confirmDialog(`ลบ ${f.name} ออกจากคลัง? (ประวัติที่บันทึกไว้ยังอยู่)`, { danger: true, okText: 'ลบ' }))) return
    await deleteRows('foods', [f.id])
    await qc.invalidateQueries({ queryKey: nk.foods })
  }

  const onCode = async (code: string) => {
    setScan(false)
    const local = foods.data?.find((f) => f.barcode === code)
    if (local) return setDraft(local)
    const off = navigator.onLine ? await lookupOpenFoodFacts(code).catch(() => null) : null
    toast(off ? 'พบใน Open Food Facts' : 'ไม่พบ — กรอกเอง')
    setDraft(off ?? { barcode: code, source: 'barcode' })
  }

  return (
    <div className="space-y-4">
      <PageTitle action={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setScan(true)}>📷</Button><Button size="sm" onClick={() => setDraft({})}>+ อาหาร</Button></div>}>คลังอาหาร</PageTitle>
      <Link to="/nutrition" className="-mt-2 block text-sm text-blue-700 dark:text-blue-300">← โภชนาการ</Link>
      <Input placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {['', ...cats].map((c) => (
          <button key={c || 'all'} type="button" onClick={() => setCat(c)}
            className={cx('min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold', cat === c ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>
            {c || 'ทั้งหมด'}
          </button>
        ))}
      </div>
      {foods.isLoading && <Spinner />}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        {list.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft(f)}>
              <div className="truncate font-semibold">{f.is_favorite && '⭐ '}{f.name}{f.brand ? <span className="font-normal text-slate-500"> · {f.brand}</span> : null}</div>
              <div className="text-xs text-slate-500">
                {f.serving_desc} · {Math.round(Number(f.calories))} kcal · P {Number(f.protein_g)} · C {Number(f.carb_g)} · F {Number(f.fat_g)}
                {f.is_estimate && <Badge color="amber" className="ml-1">ค่าประมาณ</Badge>}
              </div>
            </button>
            <Button size="sm" variant="ghost" onClick={() => void remove(f)}>ลบ</Button>
          </li>
        ))}
      </ul>
      {foods.data && !list.length && <Empty>ไม่พบอาหาร</Empty>}
      {draft && <FoodForm initial={draft} onClose={() => setDraft(null)} />}
      {scan && <BarcodeScanner onClose={() => setScan(false)} onCode={(c) => void onCode(c)} />}
    </div>
  )
}
