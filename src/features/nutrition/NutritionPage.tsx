import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWeeklySummary } from '@/lib/api'
import { addDays, fmtLongDate, todayIso, weekStart } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Card, Input, PageTitle, Spinner, Stepper, cx } from '@/components/ui'
import { Modal, toast } from '@/components/overlay'
import type { FoodLog, Meal } from '@/types/database'
import { nk, useSupplementLog, useSupplements, type TemplateItem } from './api'
import { AddFoodSheet } from './AddFoodSheet'
import { DAY_TYPE_TH, MacroSummary } from './MacroSummary'
import { SuggestionCard } from './SuggestionCard'
import { TdeeCard } from './TdeeCard'
import { fmtServings, sumMacros } from './nutritionCalc'
import { defaultMeal, MEALS, useNutritionDay } from './useNutritionDay'

const NutritionCharts = lazy(() => import('./NutritionCharts').then((m) => ({ default: m.NutritionCharts })))

export function NutritionPage() {
  const [date, setDate] = useState(todayIso())
  const day = useNutritionDay(date)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [saveTpl, setSaveTpl] = useState<Meal | null>(null)
  const isToday = date === todayIso()
  const rows = day.log.data ?? []

  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/nutrition/foods"><Button size="sm" variant="secondary">คลังอาหาร</Button></Link>}>โภชนาการ</PageTitle>

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))}>‹</Button>
        <button type="button" className="text-center" onClick={() => setDate(todayIso())}>
          <div className="font-semibold">{isToday ? 'วันนี้' : fmtLongDate(date)}</div>
          <div className="text-xs text-slate-500">{isToday ? fmtLongDate(date) : 'แตะเพื่อกลับวันนี้'}</div>
        </button>
        <Button size="sm" variant="ghost" disabled={isToday} onClick={() => setDate(addDays(date, 1))}>›</Button>
      </div>

      <Card title={<span>เป้าวันนี้ <Badge color="violet">{DAY_TYPE_TH[day.dayType]}</Badge></span>}>
        {day.target ? <MacroSummary eaten={day.eaten} target={day.target} /> : <Spinner />}
        {day.eaten.fiber_g != null && (
          <p className="mt-2 text-xs text-slate-500">ใยอาหาร {day.eaten.fiber_g} g · โซเดียม {day.eaten.sodium_mg?.toLocaleString() ?? '-'} mg</p>
        )}
      </Card>

      <Button block size="lg" onClick={() => setAdding(defaultMeal())}>+ เพิ่มอาหาร</Button>

      {day.target && <SuggestionCard eaten={day.eaten} target={day.target} dayType={day.dayType} />}

      {MEALS.map((m) => {
        const items = rows.filter((r) => r.meal === m)
        if (!items.length && !['เช้า', 'กลางวัน', 'เย็น'].includes(m)) return null
        const sum = sumMacros(items)
        return (
          <Card key={m} className="!p-3"
            title={<span className="text-base">{m} <span className="text-sm font-normal text-slate-500">{sum.calories} kcal · P {sum.protein_g} g</span></span>}
            action={<div className="flex gap-1">
              {items.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSaveTpl(m)} aria-label="บันทึกเป็น template">⋯</Button>}
              <Button size="sm" variant="secondary" onClick={() => setAdding(m)}>+</Button>
            </div>}>
            {items.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setEditing(r)} className="flex min-h-12 w-full items-center justify-between gap-2 text-left">
                      <span className="min-w-0">
                        <span className="block truncate">{r.name ?? 'อาหาร'} {Number(r.servings) !== 1 && <span className="text-slate-500">×{fmtServings(Number(r.servings))}</span>}</span>
                        <span className="text-xs text-slate-500">P {Number(r.protein_g)} · C {Number(r.carb_g)} · F {Number(r.fat_g)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{Math.round(Number(r.calories))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400">ยังไม่มี</p>}
          </Card>
        )
      })}

      <WaterCard ml={day.waterMl} onAdd={day.addWater} onUndo={day.undoWater} />
      <SupplementCard date={date} />
      {isToday && <TdeeCard />}
      <WeeklyNutrition />
      <Suspense fallback={<Spinner />}><NutritionCharts /></Suspense>

      <div className="grid grid-cols-2 gap-2">
        <Link to="/nutrition/foods"><Button block variant="secondary">🥗 คลังอาหาร</Button></Link>
        <Link to="/nutrition/recipes"><Button block variant="secondary">🍱 สูตรอาหาร</Button></Link>
      </div>
      <p className="text-center text-xs text-slate-500">ตัวเลขโภชนาการเป็นค่าประมาณ ไม่ใช่คำแนะนำทางการแพทย์</p>

      {adding && <AddFoodSheet date={date} meal={adding} add={day.add} onClose={() => setAdding(null)} />}
      {editing && <EditLog row={editing} onClose={() => setEditing(null)} update={day.update} remove={day.remove} add={day.add} />}
      {saveTpl && <SaveTemplate meal={saveTpl} rows={rows.filter((r) => r.meal === saveTpl)} onClose={() => setSaveTpl(null)} />}
    </div>
  )
}

function EditLog({ row, onClose, update, remove, add }: {
  row: FoodLog
  onClose: () => void
  update: (r: FoodLog, p: Partial<FoodLog>) => Promise<void>
  remove: (r: FoodLog) => Promise<void>
  add: ReturnType<typeof useNutritionDay>['add']
}) {
  const [servings, setServings] = useState<number | null>(Number(row.servings))
  const [meal, setMeal] = useState<Meal>(row.meal)
  const save = async () => {
    const s = servings ?? Number(row.servings)
    const k = s / Number(row.servings || 1)
    const scale = (v: number | null) => (v == null ? null : Math.round(Number(v) * k * 10) / 10)
    await update(row, {
      meal, servings: s, calories: Math.round(Number(row.calories) * k), protein_g: scale(row.protein_g)!, carb_g: scale(row.carb_g)!,
      fat_g: scale(row.fat_g)!, fiber_g: scale(row.fiber_g), sodium_mg: scale(row.sodium_mg),
    })
    onClose()
  }
  const del = async () => {
    await remove(row)
    onClose()
    toast(`ลบ ${row.name ?? 'รายการ'}`, {
      ms: 5000,
      action: { label: 'เลิกทำ', run: () => void add(row.meal, [{ kind: 'copy', row }]) },
    })
  }
  return (
    <Modal open onClose={onClose} title={row.name ?? 'อาหาร'}
      footer={<><Button variant="danger" onClick={() => void del()}>ลบ</Button><Button variant="secondary" block onClick={onClose}>ปิด</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Stepper value={servings} onChange={setServings} step={0.5} min={0.5} decimals={1} suffix="เสิร์ฟ" />
        <div className="flex flex-wrap gap-1">
          {MEALS.map((m) => (
            <button key={m} type="button" onClick={() => setMeal(m)}
              className={cx('min-h-9 rounded-full px-3 text-sm font-semibold', meal === m ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{m}</button>
          ))}
        </div>
        <p className="text-sm text-slate-500">{Math.round(Number(row.calories))} kcal · P {Number(row.protein_g)} · C {Number(row.carb_g)} · F {Number(row.fat_g)} (ต่อ {fmtServings(Number(row.servings))} เสิร์ฟ)</p>
      </div>
    </Modal>
  )
}

function SaveTemplate({ meal, rows, onClose }: { meal: Meal; rows: FoodLog[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(`มื้อ${meal}ประจำ`)
  const save = async () => {
    const items: TemplateItem[] = rows.filter((r) => r.food_id || r.recipe_id)
      .map((r) => ({ food_id: r.food_id, recipe_id: r.recipe_id, name: r.name ?? '', servings: Number(r.servings) }))
    if (!items.length) return toast('Quick add บันทึกเป็น template ไม่ได้')
    await upsertRows('meal_templates', [{ name: name.trim() || meal, items: items as unknown as import('@/types/database').Json }])
    await qc.invalidateQueries({ queryKey: nk.templates })
    toast('บันทึก template แล้ว')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="บันทึกเป็น meal template"
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <Input label="ชื่อ template" value={name} onChange={(e) => setName(e.target.value)} />
      <ul className="mt-3 text-sm text-slate-600 dark:text-slate-300">{rows.map((r) => <li key={r.id}>• {r.name} ×{fmtServings(Number(r.servings))}</li>)}</ul>
    </Modal>
  )
}

function WaterCard({ ml, onAdd, onUndo }: { ml: number; onAdd: (ml: number) => Promise<void>; onUndo: () => Promise<void> }) {
  return (
    <Card title="💧 น้ำ" action={<span className="text-lg font-bold tabular-nums">{(ml / 1000).toFixed(2)} ล.</span>}>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => void onAdd(250)}>+250 ml</Button>
        <Button variant="secondary" onClick={() => void onAdd(500)}>+500 ml</Button>
        <Button variant="ghost" disabled={!ml} onClick={() => void onUndo()}>เลิกทำ</Button>
      </div>
    </Card>
  )
}

function SupplementCard({ date }: { date: string }) {
  const qc = useQueryClient()
  const supps = useSupplements()
  const log = useSupplementLog(date)
  const list = (supps.data ?? []).filter((s) => s.active)
  if (!list.length) return null
  const toggle = async (id: string) => {
    const cur = log.data?.find((l) => l.supplement_id === id)
    const taken = !(cur?.taken ?? false)
    await upsertRows('supplement_log', [{ id: cur?.id, date, supplement_id: id, taken }], 'user_id,date,supplement_id')
    await qc.invalidateQueries({ queryKey: nk.suppLog(date) })
  }
  return (
    <Card title="💊 อาหารเสริม">
      <ul className="space-y-1">
        {list.map((s) => {
          const taken = log.data?.some((l) => l.supplement_id === s.id && l.taken)
          return (
            <li key={s.id}>
              <button type="button" onClick={() => void toggle(s.id)} className="flex min-h-11 w-full items-center gap-3 text-left">
                <span className={cx('flex size-6 items-center justify-center rounded-md border-2', taken ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>{taken && '✓'}</span>
                <span className="flex-1">{s.name} <span className="text-sm text-slate-500">{[s.dose, s.timing].filter(Boolean).join(' · ')}</span></span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function WeeklyNutrition() {
  const weekly = useWeeklySummary()
  const ws = weekStart(todayIso())
  const rows = (weekly.data ?? []).filter((w) => w.week_start === ws || w.week_start === addDays(ws, -7))
  if (!rows.some((r) => r.food_days)) return null
  return (
    <Card title="📊 สรุปรายสัปดาห์">
      <table className="w-full text-sm tabular-nums">
        <thead><tr className="text-left text-slate-500"><th className="py-1" /><th className="text-right">kcal</th><th className="text-right">P</th><th className="text-right">C</th><th className="text-right">F</th></tr></thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.week_start} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2">{r.week_start === ws ? 'สัปดาห์นี้' : 'สัปดาห์ก่อน'}<div className="text-xs text-slate-500">บันทึก {r.food_days ?? 0} วัน · โปรตีนถึงเป้า {r.protein_days_hit ?? 0} · kcal ในช่วง {r.kcal_days_in_range ?? 0}</div></td>
              <td className="text-right">{r.avg_kcal ?? '-'}</td><td className="text-right">{r.avg_protein_g ?? '-'}</td>
              <td className="text-right">{r.avg_carb_g ?? '-'}</td><td className="text-right">{r.avg_fat_g ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-500">"ในช่วง" = ±10% ของเป้าแคลอรี่ของวันนั้น</p>
    </Card>
  )
}


