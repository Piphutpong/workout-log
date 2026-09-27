import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addDays } from '@/lib/date'
import { updateRows } from '@/lib/offline/queue'
import { Badge, Button, Empty, ErrorBox, Input, Spinner, Stepper, cx } from '@/components/ui'
import { Modal, toast } from '@/components/overlay'
import type { Food, Meal } from '@/types/database'
import { nk, useFoodLog, useFoodUsage, useFoods, useRecipes, useTemplates, type TemplateItem } from './api'
import { BarcodeScanner, lookupOpenFoodFacts } from './BarcodeScanner'
import { FoodForm, type FoodDraft } from './FoodForm'
import { fmtServings, recipePerServing, scaleFood, type Macros } from './nutritionCalc'
import { MEALS, type LogInput } from './useNutritionDay'

type Pick =
  | { kind: 'food'; food: Food }
  | { kind: 'recipe'; id: string; name: string; per: Macros; servingDesc: string }

/** เพิ่มอาหาร: แตะเปิด → แตะอาหาร → แตะ "เพิ่ม" (3 แตะ) */
export function AddFoodSheet({ date, meal: initialMeal, add, onClose }: {
  date: string
  meal: Meal
  add: (meal: Meal, inputs: LogInput[]) => Promise<unknown>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const foods = useFoods()
  const usage = useFoodUsage()
  const recipes = useRecipes()
  const templates = useTemplates()
  const yesterday = useFoodLog(addDays(date, -1))
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [servings, setServings] = useState<number | null>(1)
  const [mode, setMode] = useState<'list' | 'quick' | 'template' | 'scan' | 'new'>('list')
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const foodById = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f])), [foods.data])
  const recipeList = useMemo(() => (recipes.data?.recipes ?? []).map((r) => {
    const items = (recipes.data?.items ?? []).filter((i) => i.recipe_id === r.id)
      .map((i) => ({ food: foodById.get(i.food_id)!, amount_g: Number(i.amount_g) })).filter((i) => i.food)
    let per: Macros | null = null
    try { per = items.length ? recipePerServing(items, Number(r.servings)) : null } catch { per = null }
    return { r, per }
  }).filter((x) => x.per), [recipes.data, foodById])

  const lastUsed = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usage.data ?? []) if (u.food_id) m.set(u.food_id, u.last_at)
    return m
  }, [usage.data])

  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase()
  const results = useMemo(() => {
    const all = foods.data ?? []
    const t = q.trim().toLowerCase()
    if (!t) {
      const recent = all.filter((f) => lastUsed.has(f.id)).sort((a, b) => lastUsed.get(b.id)!.localeCompare(lastUsed.get(a.id)!)).slice(0, 10)
      const favs = all.filter((f) => f.is_favorite && !recent.includes(f))
      return { recent, favs, rest: [] as Food[] }
    }
    const hit = all.filter((f) => [f.name, f.name_en, f.brand, f.category].some((x) => norm(x).includes(t)))
    hit.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? '') || a.name.localeCompare(b.name, 'th'))
    return { recent: [], favs: [], rest: hit.slice(0, 40) }
  }, [foods.data, q, lastUsed])
  const recipeHits = recipeList.filter(({ r }) => !q.trim() || norm(r.name).includes(q.trim().toLowerCase()))

  const choose = (p: Pick) => {
    setPick(p)
    setServings(1)
  }

  const confirm = async () => {
    if (!pick || !servings) return
    setBusy(true)
    try {
      const input: LogInput = pick.kind === 'food'
        ? { kind: 'food', food: pick.food, servings }
        : { kind: 'recipe', recipeId: pick.id, name: pick.name, perServing: pick.per, servings }
      const res = await add(meal, [input])
      toast(`เพิ่ม ${pick.kind === 'food' ? pick.food.name : pick.name} (${meal})${(res as { queued?: boolean })?.queued ? ' · รอส่ง' : ''}`)
      setPick(null)
      setQ('')
    } finally {
      setBusy(false)
    }
  }

  const sameAsYesterday = async () => {
    const rows = (yesterday.data ?? []).filter((r) => r.meal === meal)
    if (!rows.length) return toast(`เมื่อวานไม่มีมื้อ${meal}`)
    await add(meal, rows.map((row) => ({ kind: 'copy' as const, row })))
    toast(`คัดลอกมื้อ${meal}จากเมื่อวาน ${rows.length} รายการ`)
    onClose()
  }

  const toggleFav = async (f: Food) => {
    qc.setQueryData<Food[]>(nk.foods, (old = []) => old.map((x) => (x.id === f.id ? { ...x, is_favorite: !x.is_favorite } : x)))
    await updateRows('foods', [f.id], { is_favorite: !f.is_favorite })
  }

  const onCode = async (code: string) => {
    setMode('list')
    const local = foods.data?.find((f) => f.barcode === code)
    if (local) return choose({ kind: 'food', food: local })
    setBusy(true)
    try {
      const off = navigator.onLine ? await lookupOpenFoodFacts(code) : null
      if (off) toast('พบใน Open Food Facts — ตรวจค่าแล้วบันทึกลงคลัง')
      else toast('ไม่พบสินค้า กรอกข้อมูลเองแล้วบันทึกลงคลัง')
      setDraft(off ?? { barcode: code, source: 'barcode', serving_desc: '1 ชิ้น' })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const FoodRow = ({ f }: { f: Food }) => (
    <li className="flex items-center">
      <button type="button" onClick={() => choose({ kind: 'food', food: f })}
        className={cx('flex min-h-14 flex-1 items-center gap-2 rounded-lg px-2 text-left active:bg-slate-100 dark:active:bg-slate-800',
          pick?.kind === 'food' && pick.food.id === f.id && 'bg-blue-50 dark:bg-blue-950')}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{f.name}{f.brand ? <span className="font-normal text-slate-500"> · {f.brand}</span> : null}</span>
          <span className="block text-xs text-slate-500">
            {f.serving_desc} · {Math.round(Number(f.calories))} kcal · P {Number(f.protein_g)} g
            {f.is_estimate && <Badge color="amber" className="ml-1">ค่าประมาณ</Badge>}
          </span>
        </span>
      </button>
      <button type="button" aria-label="รายการโปรด" onClick={() => void toggleFav(f)} className="p-3 text-xl">{f.is_favorite ? '⭐' : '☆'}</button>
    </li>
  )

  const preview = pick && servings ? scaleFood(pick.kind === 'food' ? pick.food : { ...pick.per }, servings) : null

  return (
    <>
      <Modal open onClose={onClose} title="เพิ่มอาหาร">
        <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
          {MEALS.map((m) => (
            <button key={m} type="button" onClick={() => setMeal(m)}
              className={cx('min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold', meal === m ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>
              {m}
            </button>
          ))}
        </div>
        <div className="mb-3 grid grid-cols-4 gap-1 text-xs">
          <Button size="sm" variant="secondary" onClick={() => void sameAsYesterday()}>🔁 เหมือนเมื่อวาน</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('template')}>📋 Template</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('quick')}>⚡ Quick</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('scan')}>📷 สแกน</Button>
        </div>

        <Input placeholder="ค้นหา ไทย/อังกฤษ เช่น กะเพรา, chicken" value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorBox error={error} />
        {foods.isLoading && <Spinner />}

        <div className="mt-2 max-h-[45dvh] overflow-y-auto">
          {results.recent.length > 0 && <h3 className="mt-1 text-xs font-semibold text-slate-500">ล่าสุด</h3>}
          <ul>{results.recent.map((f) => <FoodRow key={f.id} f={f} />)}</ul>
          {results.favs.length > 0 && <h3 className="mt-2 text-xs font-semibold text-slate-500">รายการโปรด</h3>}
          <ul>{results.favs.map((f) => <FoodRow key={f.id} f={f} />)}</ul>
          <ul>{results.rest.map((f) => <FoodRow key={f.id} f={f} />)}</ul>
          {recipeHits.length > 0 && <h3 className="mt-2 text-xs font-semibold text-slate-500">สูตรอาหารของฉัน</h3>}
          <ul>
            {recipeHits.map(({ r, per }) => (
              <li key={r.id}>
                <button type="button" onClick={() => choose({ kind: 'recipe', id: r.id, name: r.name, per: per!, servingDesc: '1 เสิร์ฟ' })}
                  className={cx('flex min-h-14 w-full flex-col justify-center rounded-lg px-2 text-left active:bg-slate-100 dark:active:bg-slate-800',
                    pick?.kind === 'recipe' && pick.id === r.id && 'bg-blue-50 dark:bg-blue-950')}>
                  <span className="font-semibold">🍱 {r.name}</span>
                  <span className="text-xs text-slate-500">1 เสิร์ฟ · {per!.calories} kcal · P {per!.protein_g} g</span>
                </button>
              </li>
            ))}
          </ul>
          {q.trim() && !results.rest.length && !recipeHits.length && <Empty>ไม่พบ "{q}"</Empty>}
          <Button className="mt-2" block size="sm" variant="ghost" onClick={() => setDraft({ name: q.trim() })}>+ สร้างอาหารใหม่{q.trim() ? ` "${q.trim()}"` : ''}</Button>
        </div>

        {pick && (
          <div className="sticky bottom-0 -mx-5 mt-3 border-t border-slate-200 bg-white px-5 pt-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{pick.kind === 'food' ? pick.food.name : pick.name}</div>
                <div className="text-xs text-slate-500">
                  {pick.kind === 'food' ? pick.food.serving_desc : pick.servingDesc} × {fmtServings(servings ?? 0)}
                  {preview && ` = ${preview.calories} kcal · P ${preview.protein_g} · C ${preview.carb_g} · F ${preview.fat_g}`}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Stepper className="flex-1" value={servings} onChange={setServings} step={0.5} min={0.5} max={20} decimals={1} suffix="เสิร์ฟ" />
              <Button size="lg" disabled={busy || !servings} onClick={() => void confirm()}>เพิ่ม</Button>
            </div>
          </div>
        )}
      </Modal>

      {mode === 'quick' && <QuickAdd onClose={() => setMode('list')} onAdd={async (name, m) => {
        await add(meal, [{ kind: 'quick', name, macros: m }])
        toast(`Quick add ${m.calories} kcal`)
        setMode('list')
      }} />}
      {mode === 'template' && <TemplatePicker templates={templates.data ?? []} foods={foodById} onClose={() => setMode('list')} onApply={async (items) => {
        const inputs: LogInput[] = items.flatMap((it): LogInput[] => {
          const f = it.food_id ? foodById.get(it.food_id) : undefined
          if (f) return [{ kind: 'food', food: f, servings: it.servings }]
          const rc = it.recipe_id ? recipeList.find((x) => x.r.id === it.recipe_id) : undefined
          if (rc) return [{ kind: 'recipe', recipeId: rc.r.id, name: rc.r.name, perServing: rc.per!, servings: it.servings }]
          return []
        })
        await add(meal, inputs)
        toast(`ใช้ template ${inputs.length} รายการ`)
        onClose()
      }} />}
      {mode === 'scan' && <BarcodeScanner onClose={() => setMode('list')} onCode={(c) => void onCode(c)} />}
      {draft && <FoodForm initial={draft} onClose={() => setDraft(null)} onSaved={(f) => choose({ kind: 'food', food: f })} />}
    </>
  )
}

function QuickAdd({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, m: Macros) => Promise<void> }) {
  const [f, setF] = useState({ name: '', kcal: '', p: '', c: '', fat: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const n = (s: string) => (s.trim() ? Number(s) : 0)
  return (
    <Modal open onClose={onClose} title="⚡ Quick add"
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button>
        <Button block disabled={!f.kcal.trim()} onClick={() => void onAdd(f.name.trim(), { calories: n(f.kcal), protein_g: n(f.p), carb_g: n(f.c), fat_g: n(f.fat), fiber_g: null, sodium_mg: null })}>เพิ่ม</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="แคลอรี่ (kcal)" inputMode="numeric" value={f.kcal} onChange={set('kcal')} autoFocus />
        <Input label="โปรตีน (g)" inputMode="decimal" value={f.p} onChange={set('p')} />
        <Input label="คาร์บ (ไม่บังคับ)" inputMode="decimal" value={f.c} onChange={set('c')} />
        <Input label="ไขมัน (ไม่บังคับ)" inputMode="decimal" value={f.fat} onChange={set('fat')} />
        <Input className="col-span-2" label="ชื่อ (ไม่บังคับ)" value={f.name} onChange={set('name')} />
      </div>
    </Modal>
  )
}

function TemplatePicker({ templates, foods, onClose, onApply }: {
  templates: { id: string; name: string; items: unknown }[]
  foods: Map<string, Food>
  onClose: () => void
  onApply: (items: TemplateItem[]) => Promise<void>
}) {
  return (
    <Modal open onClose={onClose} title="📋 ใช้ meal template">
      {templates.length ? (
        <ul className="space-y-2">
          {templates.map((t) => {
            const items = (t.items as TemplateItem[]) ?? []
            const kcal = items.reduce((a, it) => a + (it.food_id && foods.get(it.food_id) ? Number(foods.get(it.food_id)!.calories) * it.servings : 0), 0)
            return (
              <li key={t.id}>
                <button type="button" onClick={() => void onApply(items)} className="w-full rounded-xl bg-slate-50 p-3 text-left active:bg-slate-100 dark:bg-slate-800/60">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-slate-500">{items.map((i) => `${i.name} ×${fmtServings(i.servings)}`).join(', ')}{kcal ? ` · ~${Math.round(kcal)} kcal` : ''}</div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : <Empty>ยังไม่มี template — ในหน้าโภชนาการ กด "⋯" ที่มื้อแล้วเลือก "บันทึกเป็น template"</Empty>}
    </Modal>
  )
}
