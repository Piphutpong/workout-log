import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useExercises } from '@/lib/api'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Empty, ErrorBox, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { Modal } from '@/components/overlay'
import type { Exercise, MeasureType } from '@/types/database'

const MEASURE_TH: Record<MeasureType, string> = { reps: 'จำนวนครั้ง', seconds: 'วินาที', band: 'ยางยืด' }

/** คลังท่า */
export function ExercisesPage() {
  const exercises = useExercises()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Exercise> | null>(null)
  if (exercises.isLoading) return <Spinner />
  const list = (exercises.data ?? []).filter((e) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="space-y-4">
      <PageTitle action={<Button size="sm" onClick={() => setEditing({})}>+ ท่า</Button>}>คลังท่า</PageTitle>
      <Input placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setEditing(e)} className={`flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2 text-left ${e.active ? '' : 'opacity-50'}`}>
              <span>
                <span className="font-semibold">{e.name}</span>
                <span className="block text-xs text-slate-500">{MEASURE_TH[e.measure_type]}{e.muscle_group ? ` · ${e.muscle_group}` : ''}{e.note ? ` · ${e.note}` : ''}</span>
              </span>
              <span className="flex gap-1">{e.grip_intensive && <Badge color="amber">บีบจับ</Badge>}{!e.active && <Badge>ปิด</Badge>}</span>
            </button>
          </li>
        ))}
      </ul>
      {!list.length && <Empty>ไม่พบท่า</Empty>}
      <p className="text-xs text-slate-500">"บีบจับ" = ท่าที่ใช้แรงบีบมือ ใช้กับคำแนะนำเมื่อความเจ็บศอกเพิ่มขึ้น</p>
      {editing && <ExerciseForm ex={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExerciseForm({ ex, onClose }: { ex: Partial<Exercise>; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: ex.name ?? '', measure_type: (ex.measure_type ?? 'reps') as MeasureType, muscle_group: ex.muscle_group ?? '',
    note: ex.note ?? '', grip_intensive: ex.grip_intensive ?? false, active: ex.active ?? true,
  })
  const [error, setError] = useState<unknown>(null)
  const save = async () => {
    setError(null)
    try {
      if (!f.name.trim()) throw new Error('กรอกชื่อท่า')
      const row = { ...f, name: f.name.trim(), muscle_group: f.muscle_group || null, note: f.note || null }
      if (ex.id) await updateRows('exercises', [ex.id], row)
      else await upsertRows('exercises', [row])
      await qc.invalidateQueries({ queryKey: qk.exercises })
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Modal open onClose={onClose} title={ex.id ? 'แก้ท่า' : 'ท่าใหม่'}
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="วัดผลเป็น" value={f.measure_type} onChange={(e) => setF({ ...f, measure_type: e.target.value as MeasureType })}>
            {Object.entries(MEASURE_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="กลุ่มกล้ามเนื้อ" value={f.muscle_group} onChange={(e) => setF({ ...f, muscle_group: e.target.value })} />
        </div>
        <Input label="โน้ต" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={f.grip_intensive} onChange={(e) => setF({ ...f, grip_intensive: e.target.checked })} /> ใช้การบีบจับ</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> เปิดใช้งาน</label>
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}
