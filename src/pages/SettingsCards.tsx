// การ์ดตั้งค่าเพิ่มเติม (ข้อ 5.13): ข้อมูลส่วนตัว, เป้าโภชนาการตามประเภทวัน, อาหารเสริม
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, qk, useSettings } from '@/lib/api'
import { deleteRows, updateRows, upsertRows } from '@/lib/offline/queue'
import { rangeWarnings } from '@/lib/validation'
import { Button, Card, Input, Select } from '@/components/ui'
import { confirmDialog, confirmWarnings, Modal, toast } from '@/components/overlay'
import { nk, useSupplements, useTargets } from '@/features/nutrition/api'
import { DAY_TYPE_TH } from '@/features/nutrition/MacroSummary'
import type { DayType, Supplement } from '@/types/database'

export function ProfileCard() {
  const qc = useQueryClient()
  const s = useSettings().data
  const [f, setF] = useState({ display_name: '', sex: '', height_cm: '', birth_date: '', program_start_date: '', target_weight_kg: '' })
  useEffect(() => {
    if (s) setF({
      display_name: s.display_name ?? '', sex: s.sex ?? '', height_cm: s.height_cm?.toString() ?? '', birth_date: s.birth_date ?? '',
      program_start_date: s.program_start_date ?? '', target_weight_kg: s.target_weight_kg?.toString() ?? '',
    })
  }, [s])
  if (!s) return null
  const save = async () => {
    const h = f.height_cm ? Number(f.height_cm) : null
    const w = f.target_weight_kg ? Number(f.target_weight_kg) : null
    if (!(await confirmWarnings(rangeWarnings({ height_cm: h, body_weight_kg: w })))) return
    await updateRows('settings', [s.id], {
      display_name: f.display_name || null, sex: (f.sex || null) as 'male' | 'female' | null, height_cm: h,
      birth_date: f.birth_date || null, program_start_date: f.program_start_date || null, target_weight_kg: w,
    })
    await Promise.all([qc.invalidateQueries({ queryKey: qk.settings }), invalidateDash(qc)])
    toast('บันทึกข้อมูลส่วนตัวแล้ว')
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const age = f.birth_date ? Math.floor((Date.now() - new Date(f.birth_date).getTime()) / (365.25 * 86_400_000)) : null
  return (
    <Card title="👤 ข้อมูลส่วนตัว">
      <div className="grid grid-cols-2 gap-3">
        <Input label="ชื่อที่แสดง" value={f.display_name} onChange={set('display_name')} />
        <Select label="เพศ" value={f.sex} onChange={set('sex')}>
          <option value="">—</option><option value="male">ชาย</option><option value="female">หญิง</option>
        </Select>
        <Input label="ส่วนสูง (ซม.)" inputMode="decimal" value={f.height_cm} onChange={set('height_cm')} />
        <Input label="วันเกิด" hint={age != null ? `อายุ ${age}` : undefined} type="date" value={f.birth_date} onChange={set('birth_date')} />
        <Input label="วันเริ่มโปรแกรม" type="date" value={f.program_start_date} onChange={set('program_start_date')} />
        <Input label="น้ำหนักเป้าหมาย (กก.)" inputMode="decimal" value={f.target_weight_kg} onChange={set('target_weight_kg')} />
      </div>
      <p className="mt-2 text-xs text-slate-500">เป้าหมายรายละเอียด (วันที่ ทิศทาง) แก้ได้ที่หน้า "เป้าหมาย"</p>
      <Button className="mt-3" block onClick={() => void save()}>บันทึก</Button>
    </Card>
  )
}

const ORDER: DayType[] = ['weight', 'run_easy', 'run_hard', 'rest']

export function NutritionTargetsCard() {
  const qc = useQueryClient()
  const targets = useTargets()
  const [rows, setRows] = useState<Record<string, { kcal: string; protein_g: string; carb_g: string; fat_g: string }>>({})
  useEffect(() => {
    if (targets.data) setRows(Object.fromEntries(targets.data.map((t) => [t.id, {
      kcal: String(t.kcal), protein_g: String(t.protein_g), carb_g: String(t.carb_g), fat_g: String(t.fat_g),
    }])))
  }, [targets.data])
  const list = [...(targets.data ?? [])].sort((a, b) => ORDER.indexOf(a.day_type) - ORDER.indexOf(b.day_type))
  const save = async () => {
    const warnings = list.flatMap((t) => rangeWarnings({ kcal: Number(rows[t.id]?.kcal) }))
    if (!(await confirmWarnings(warnings))) return
    for (const t of list) {
      const r = rows[t.id]
      await updateRows('nutrition_targets', [t.id], {
        kcal: Math.round(Number(r.kcal)), protein_g: Math.round(Number(r.protein_g)), carb_g: Math.round(Number(r.carb_g)), fat_g: Math.round(Number(r.fat_g)),
      })
    }
    await Promise.all([qc.invalidateQueries({ queryKey: nk.targets }), invalidateDash(qc)])
    toast('บันทึกเป้าโภชนาการแล้ว')
  }
  const cell = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white text-center tabular-nums dark:border-slate-700 dark:bg-slate-950'
  return (
    <Card title="🍽 เป้าโภชนาการตามประเภทวัน">
      <div className="grid grid-cols-[5.5rem_repeat(4,1fr)] gap-2 text-sm">
        <span /><span className="text-center font-medium">kcal</span><span className="text-center font-medium">P</span>
        <span className="text-center font-medium">C</span><span className="text-center font-medium">F</span>
        {list.map((t) => {
          const r = rows[t.id]
          if (!r) return null
          const kcalFromMacros = Number(r.protein_g) * 4 + Number(r.carb_g) * 4 + Number(r.fat_g) * 9
          return (
            <div key={t.id} className="contents">
              <span className="self-center font-medium">
                {DAY_TYPE_TH[t.day_type]}
                {Math.abs(kcalFromMacros - Number(r.kcal)) > 100 && <span className="block text-[10px] text-amber-600">P/C/F = {kcalFromMacros} kcal</span>}
              </span>
              {(['kcal', 'protein_g', 'carb_g', 'fat_g'] as const).map((k) => (
                <input key={k} inputMode="numeric" className={cell} value={r[k]}
                  onChange={(e) => setRows({ ...rows, [t.id]: { ...r, [k]: e.target.value.replace(/[^\d]/g, '') } })} />
              ))}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">โปรตีนคงที่ทุกวัน ปรับขึ้น-ลงที่คาร์บ · ข้อเสนอ Adaptive TDEE จะปรับตารางนี้เมื่อกดยืนยัน</p>
      <Button className="mt-3" block onClick={() => void save()}>บันทึก</Button>
    </Card>
  )
}

export function SupplementsCard() {
  const qc = useQueryClient()
  const supps = useSupplements()
  const [editing, setEditing] = useState<Partial<Supplement> | null>(null)
  return (
    <Card title="💊 อาหารเสริม" action={<Button size="sm" variant="secondary" onClick={() => setEditing({})}>+ เพิ่ม</Button>}>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {(supps.data ?? []).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setEditing(s)} className={`flex min-h-12 w-full items-center justify-between text-left ${s.active ? '' : 'opacity-50'}`}>
              <span>{s.name} <span className="text-sm text-slate-500">{[s.dose, s.timing].filter(Boolean).join(' · ')}</span></span>
              {!s.active && <span className="text-xs">ปิด</span>}
            </button>
          </li>
        ))}
      </ul>
      {editing && <SupplementForm s={editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: nk.supplements })} />}
    </Card>
  )
}

function SupplementForm({ s, onClose, onSaved }: { s: Partial<Supplement>; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({ name: s.name ?? '', dose: s.dose ?? '', timing: s.timing ?? '', active: s.active ?? true })
  const save = async () => {
    if (!f.name.trim()) return toast('กรอกชื่อ')
    const row = { name: f.name.trim(), dose: f.dose || null, timing: f.timing || null, active: f.active }
    if (s.id) await updateRows('supplements', [s.id], row)
    else await upsertRows('supplements', [row])
    await onSaved()
    onClose()
  }
  const del = async () => {
    if (!(await confirmDialog(`ลบ ${s.name}? (ประวัติการติ๊กจะถูกลบด้วย — ถ้าแค่เลิกใช้ให้ปิดแทน)`, { danger: true, okText: 'ลบ' }))) return
    await deleteRows('supplements', [s.id!])
    await onSaved()
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={s.id ? 'แก้อาหารเสริม' : 'อาหารเสริมใหม่'}
      footer={<>{s.id && <Button variant="danger" onClick={() => void del()}>ลบ</Button>}<Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น Fish oil, Vitamin D" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ขนาด" value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} placeholder="เช่น 5 g" />
          <Input label="เวลา" value={f.timing} onChange={(e) => setF({ ...f, timing: e.target.value })} placeholder="เช่น หลังอาหารเช้า" />
        </div>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> ใช้อยู่ (แสดงในรายการติ๊กรายวัน)</label>
      </div>
    </Modal>
  )
}
