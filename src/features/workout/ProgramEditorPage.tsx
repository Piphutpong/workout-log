import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useExercises, useProgramExercises, usePrograms } from '@/lib/api'
import { deleteRows, updateRows, upsertRows, uuid } from '@/lib/offline/queue'
import { Button, Card, Empty, ErrorBox, Input, Select, Spinner, Textarea, cx } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import { SortableList } from '@/components/SortableList'
import type { Exercise, MeasureType, ProgramExercise } from '@/types/database'
import { fmtTarget } from './format'

const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#14b8a6', '#64748b']
const MEASURE_TH: Record<MeasureType, string> = { reps: 'จำนวนครั้ง', seconds: 'วินาที', band: 'ยางยืด' }

export function ProgramEditorPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const programs = usePrograms()
  const pes = useProgramExercises()
  const exercises = useExercises()
  const program = programs.data?.find((p) => p.id === id)
  const [meta, setMeta] = useState({ name: '', description: '', color: COLORS[0], is_warmup: false, active: true })
  const [editing, setEditing] = useState<ProgramExercise | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (program) setMeta({ name: program.name, description: program.description ?? '', color: program.color, is_warmup: program.is_warmup, active: program.active })
  }, [program])

  if (programs.isLoading || pes.isLoading || exercises.isLoading) return <Spinner />
  if (!program) return <ErrorBox error={new Error('ไม่พบโปรแกรม')} />

  const items = (pes.data ?? []).filter((p) => p.program_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const exById = new Map((exercises.data ?? []).map((e) => [e.id, e]))
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.programExercises }), qc.invalidateQueries({ queryKey: qk.programs })])

  const saveMeta = async () => {
    await updateRows('weight_programs', [program.id], { ...meta, description: meta.description || null })
    await refresh()
    toast('บันทึกแล้ว')
  }

  const reorder = async (next: ProgramExercise[]) => {
    qc.setQueryData<ProgramExercise[]>(qk.programExercises, (old = []) =>
      old.map((pe) => {
        const i = next.findIndex((n) => n.id === pe.id)
        return i >= 0 ? { ...pe, sort_order: i + 1 } : pe
      }))
    await upsertRows('program_exercises', next.map((pe, i) => ({ ...stripBase(pe), id: pe.id, sort_order: i + 1 })))
    await refresh()
  }

  const remove = async (pe: ProgramExercise) => {
    if (!(await confirmDialog(`เอา ${exById.get(pe.exercise_id)?.name} ออกจากโปรแกรม?`))) return
    await deleteRows('program_exercises', [pe.id])
    await refresh()
  }

  return (
    <div className="space-y-4">
      <Link to="/workout/programs" className="block text-sm text-blue-700 dark:text-blue-300">← โปรแกรมทั้งหมด</Link>
      <Card title="ข้อมูลโปรแกรม">
        <div className="space-y-3">
          <Input label="ชื่อ" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          <Textarea label="คำอธิบาย" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                className={cx('size-10 rounded-full', meta.color === c && 'ring-4 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900')}
                style={{ background: c }}
                onClick={() => setMeta({ ...meta, color: c })}
              />
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5" checked={meta.is_warmup} onChange={(e) => setMeta({ ...meta, is_warmup: e.target.checked })} />
            เป็น warm-up (แสดงก่อนท่าหลักทุกครั้ง เช่น Rehab)
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5" checked={meta.active} onChange={(e) => setMeta({ ...meta, active: e.target.checked })} />
            เปิดใช้งาน
          </label>
          <Button block onClick={saveMeta}>บันทึกข้อมูลโปรแกรม</Button>
        </div>
      </Card>

      <Card title={`ท่าในโปรแกรม (${items.length})`} action={<Button size="sm" onClick={() => setAdding(true)}>+ เพิ่มท่า</Button>}>
        {items.length ? (
          <SortableList
            items={items}
            keyOf={(pe) => pe.id}
            onReorder={(n) => void reorder(n)}
            render={(pe, handle) => {
              const ex = exById.get(pe.exercise_id)
              return (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1 dark:bg-slate-800/60">
                  {handle}
                  <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => setEditing(pe)}>
                    <div className="truncate font-semibold">{ex?.name ?? '?'}</div>
                    <div className="text-sm text-slate-500">{fmtTarget(pe)} · {pe.rest_sec === 0 ? 'ไม่พัก' : `พัก ${pe.rest_sec ?? '-'} วิ`}{pe.superset_group ? ` · ↔ Superset ${pe.superset_group}` : ''}</div>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(pe)}>ลบ</Button>
                </div>
              )
            }}
          />
        ) : <Empty>ยังไม่มีท่า กด "+ เพิ่มท่า"</Empty>}
        <p className="mt-2 text-xs text-slate-500">ลาก ⠿ เพื่อเรียงลำดับ · แตะชื่อท่าเพื่อแก้เป้า</p>
      </Card>

      {editing && (
        <TargetEditor
          pe={editing}
          exercise={exById.get(editing.exercise_id)}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {adding && (
        <AddExerciseModal
          programId={program.id}
          nextOrder={items.length + 1}
          exercises={exercises.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            await Promise.all([refresh(), qc.invalidateQueries({ queryKey: qk.exercises })])
          }}
        />
      )}
    </div>
  )
}

function stripBase(pe: ProgramExercise) {
  const { created_at: _c, updated_at: _u, user_id: _uid, ...rest } = pe
  return rest
}

function TargetEditor({ pe, exercise, onClose, onSaved }: {
  pe: ProgramExercise
  exercise: Exercise | undefined
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const isSec = exercise?.measure_type === 'seconds'
  const [f, setF] = useState({
    target_sets: String(pe.target_sets),
    target_reps: String(pe.target_reps ?? ''),
    target_reps_max: String(pe.target_reps_max ?? ''),
    superset_group: pe.superset_group ?? '',
    target_seconds: String(pe.target_seconds ?? ''),
    target_weight_lb: String(pe.target_weight_lb ?? ''),
    rest_sec: String(pe.rest_sec ?? ''),
    note: pe.note ?? '',
  })
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const save = async () => {
    await updateRows('program_exercises', [pe.id], {
      target_sets: num(f.target_sets) ?? 3,
      target_reps: isSec ? null : num(f.target_reps),
      target_reps_max: isSec ? null : num(f.target_reps_max),
      superset_group: f.superset_group.trim() || null,
      target_seconds: isSec ? num(f.target_seconds) : null,
      target_weight_lb: num(f.target_weight_lb),
      rest_sec: num(f.rest_sec),
      note: f.note || null,
    })
    await onSaved()
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open onClose={onClose} title={exercise?.name} footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={save}>บันทึก</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="จำนวนเซ็ต" inputMode="numeric" value={f.target_sets} onChange={set('target_sets')} />
        {isSec
          ? <Input label="วินาที/เซ็ต" inputMode="numeric" value={f.target_seconds} onChange={set('target_seconds')} />
          : <Input label="ครั้ง/เซ็ต (ต่ำสุด)" inputMode="numeric" value={f.target_reps} onChange={set('target_reps')} />}
        {!isSec && <Input label="ครั้ง/เซ็ต (สูงสุด)" hint="เช่น 15-20" inputMode="numeric" value={f.target_reps_max} onChange={set('target_reps_max')} />}
        <Input label="Superset กลุ่ม" hint="ท่าที่กลุ่มเดียวกัน = ทำคู่" value={f.superset_group} onChange={set('superset_group')} />
        {exercise?.measure_type !== 'band' && <Input label="น้ำหนักเป้า (lb)" inputMode="decimal" value={f.target_weight_lb} onChange={set('target_weight_lb')} />}
        <Input label="พัก (วินาที)" inputMode="numeric" value={f.rest_sec} onChange={set('rest_sec')} />
      </div>
      <Input className="mt-3" label="โน้ต" value={f.note} onChange={set('note')} />
    </Modal>
  )
}

function AddExerciseModal({ programId, nextOrder, exercises, onClose, onSaved }: {
  programId: string
  nextOrder: number
  exercises: Exercise[]
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [mode, setMode] = useState<'library' | 'new'>('library')
  const [exId, setExId] = useState('')
  const [nu, setNu] = useState({ name: '', measure_type: 'reps' as MeasureType, muscle_group: '' })
  const [sets, setSets] = useState('3')
  const [amount, setAmount] = useState('10')
  const [error, setError] = useState<unknown>(null)

  const measure = mode === 'library' ? exercises.find((e) => e.id === exId)?.measure_type : nu.measure_type
  const save = async () => {
    setError(null)
    try {
      let id = exId
      if (mode === 'new') {
        if (!nu.name.trim()) throw new Error('กรอกชื่อท่า')
        if (exercises.some((e) => e.name.toLowerCase() === nu.name.trim().toLowerCase())) throw new Error('มีท่านี้ในคลังแล้ว')
        id = uuid()
        await upsertRows('exercises', [{ id, name: nu.name.trim(), measure_type: nu.measure_type, muscle_group: nu.muscle_group || null }])
      }
      if (!id) throw new Error('เลือกท่า')
      await upsertRows('program_exercises', [{
        program_id: programId, exercise_id: id, sort_order: nextOrder, target_sets: Number(sets) || 3,
        target_reps: measure === 'seconds' ? null : Number(amount) || 10,
        target_seconds: measure === 'seconds' ? Number(amount) || 30 : null,
        rest_sec: 90,
      }])
      await onSaved()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Modal open onClose={onClose} title="เพิ่มท่า" footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={save}>เพิ่ม</Button></>}>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={mode === 'library' ? 'primary' : 'secondary'} onClick={() => setMode('library')}>จากคลังท่า</Button>
        <Button size="sm" variant={mode === 'new' ? 'primary' : 'secondary'} onClick={() => setMode('new')}>สร้างท่าใหม่</Button>
      </div>
      {mode === 'library' ? (
        <Select label="ท่า" value={exId} onChange={(e) => setExId(e.target.value)}>
          <option value="">— เลือก —</option>
          {exercises.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name} ({MEASURE_TH[e.measure_type]})</option>)}
        </Select>
      ) : (
        <div className="space-y-3">
          <Input label="ชื่อท่า" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <Select label="วัดผลเป็น" value={nu.measure_type} onChange={(e) => setNu({ ...nu, measure_type: e.target.value as MeasureType })}>
            {Object.entries(MEASURE_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="กลุ่มกล้ามเนื้อ" value={nu.muscle_group} onChange={(e) => setNu({ ...nu, muscle_group: e.target.value })} />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Input label="เซ็ต" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
        <Input label={measure === 'seconds' ? 'วินาที/เซ็ต' : 'ครั้ง/เซ็ต'} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="mt-3"><ErrorBox error={error} /></div>
    </Modal>
  )
}
