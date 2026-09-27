import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk, usePrograms, useWarmups } from '@/lib/api'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Button, Card, Segmented, Select } from '@/components/ui'
import { toast } from '@/components/overlay'
import type { WarmupItem, WarmupRoutine } from '@/types/database'

const TYPE_TH: Record<WarmupRoutine['activity_type'], string> = { weight: 'ก่อนเวท', run_easy: 'ก่อนวิ่งเบา', run_hard: 'ก่อนวิ่งเร็ว' }
const inputCls = 'min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950'

/** แก้ warm-up routine (แสดงเป็น checklist บนหน้าวันนี้) */
export function WarmupEditor() {
  const qc = useQueryClient()
  const warmups = useWarmups()
  const programs = usePrograms()
  const [type, setType] = useState<WarmupRoutine['activity_type']>('weight')
  const routine = warmups.data?.find((w) => w.activity_type === type)
  const [items, setItems] = useState<WarmupItem[]>([])
  useEffect(() => setItems(routine?.items ?? []), [routine])

  const save = async () => {
    const clean = items.filter((i) => i.name.trim()).map((i) => ({
      name: i.name.trim(), ...(i.sec ? { sec: i.sec } : {}), ...(i.reps ? { reps: i.reps } : {}), ...(i.program_id ? { program_id: i.program_id } : {}),
    }))
    if (routine) await updateRows('warmup_routines', [routine.id], { items: clean })
    else await upsertRows('warmup_routines', [{ name: TYPE_TH[type], activity_type: type, items: clean }])
    await qc.invalidateQueries({ queryKey: qk.warmups })
    toast('บันทึก warm-up แล้ว')
  }
  const upd = (i: number, p: Partial<WarmupItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const num = (v: string) => (v.trim() ? Math.max(0, Math.round(Number(v))) || undefined : undefined)

  return (
    <Card title="🔥 Warm-up routine">
      <Segmented value={type} onChange={setType} options={(Object.keys(TYPE_TH) as WarmupRoutine['activity_type'][]).map((k) => ({ value: k, label: TYPE_TH[k] }))} />
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[1fr_4rem_4rem_2rem] gap-2 text-xs text-slate-500"><span>รายการ</span><span>นาที</span><span>ครั้ง</span><span /></div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_4rem_2rem] items-center gap-2">
            <input className={inputCls} value={it.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <input className={`${inputCls} text-center`} inputMode="decimal" value={it.sec ? it.sec / 60 : ''} onChange={(e) => upd(i, { sec: num(String(Number(e.target.value) * 60)) })} />
            <input className={`${inputCls} text-center`} inputMode="numeric" value={it.reps ?? ''} onChange={(e) => upd(i, { reps: num(e.target.value) })} />
            <button type="button" className="text-slate-400" aria-label="ลบ" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setItems([...items, { name: '' }])}>+ รายการ</Button>
        {type === 'weight' && (
          <Select className="w-48" value="" onChange={(e) => {
            const p = programs.data?.find((x) => x.id === e.target.value)
            if (p) setItems([...items, { name: `โปรแกรม ${p.name}`, program_id: p.id }])
          }}>
            <option value="">+ อ้างอิงโปรแกรม warm-up</option>
            {(programs.data ?? []).filter((p) => p.is_warmup).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Button size="sm" className="ml-auto" onClick={() => void save()}>บันทึก</Button>
      </div>
    </Card>
  )
}
