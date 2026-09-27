import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useProgramExercises, usePrograms, useRotation, useSchedule } from '@/lib/api'
import { deleteRows, updateRows, upsertRows, uuid } from '@/lib/offline/queue'
import { THAI_DOW_SHORT } from '@/lib/date'
import { Badge, Button, Card, Empty, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import { SortableList } from '@/components/SortableList'
import { FREE_RUN_TEMPLATES } from '@/features/run/runMeta'
import type { Activity, WeeklySchedule, WeightProgram } from '@/types/database'

const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#14b8a6', '#64748b']

export function ProgramsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const programs = usePrograms()
  const pes = useProgramExercises()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  if (programs.isLoading || pes.isLoading) return <Spinner />
  const list = programs.data ?? []
  const count = (id: string) => (pes.data ?? []).filter((p) => p.program_id === id).length
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.programs }), qc.invalidateQueries({ queryKey: qk.programExercises }), qc.invalidateQueries({ queryKey: qk.rotation })])

  const create = async () => {
    if (!name.trim()) return
    const { ids } = await upsertRows('weight_programs', [{
      name: name.trim(), color: COLORS[list.length % COLORS.length], sort_order: list.length + 1,
    }])
    setCreating(false)
    setName('')
    await refresh()
    navigate(`/workout/programs/${ids[0]}`)
  }

  const copy = async (p: WeightProgram) => {
    const newId = uuid()
    await upsertRows('weight_programs', [{
      id: newId, name: `${p.name} (สำเนา)`, description: p.description, color: COLORS[(list.length + 1) % COLORS.length],
      is_warmup: p.is_warmup, sort_order: list.length + 1,
    }])
    const src = (pes.data ?? []).filter((x) => x.program_id === p.id)
    if (src.length) {
      await upsertRows('program_exercises', src.map((x) => ({
        program_id: newId, exercise_id: x.exercise_id, sort_order: x.sort_order, target_sets: x.target_sets,
        target_reps: x.target_reps, target_seconds: x.target_seconds, target_weight_lb: x.target_weight_lb, rest_sec: x.rest_sec, note: x.note,
        target_reps_max: x.target_reps_max, superset_group: x.superset_group,
      })))
    }
    await refresh()
    toast(`คัดลอก ${p.name} แล้ว`)
    navigate(`/workout/programs/${newId}`)
  }

  const remove = async (p: WeightProgram) => {
    if (!(await confirmDialog(`ลบโปรแกรม ${p.name}? (ประวัติที่บันทึกไว้ยังอยู่)`, { danger: true, okText: 'ลบ' }))) return
    await deleteRows('weight_programs', [p.id])
    await refresh()
  }

  return (
    <div className="space-y-4">
      <PageTitle action={<Button size="sm" onClick={() => setCreating(true)}>+ โปรแกรมใหม่</Button>}>โปรแกรมเวท</PageTitle>
      <Link to="/workout" className="-mt-2 block text-sm text-blue-700 dark:text-blue-300">← กลับไปบันทึกเวท</Link>

      <div className="space-y-2">
        {list.map((p) => (
          <Card key={p.id} className="!p-3">
            <div className="flex items-center gap-3">
              <span className="size-4 shrink-0 rounded-full" style={{ background: p.color }} />
              <Link to={`/workout/programs/${p.id}`} className="min-w-0 flex-1">
                <div className="font-bold">{p.name} {p.is_warmup && <Badge color="green">warm-up</Badge>} {!p.active && <Badge>ปิด</Badge>}</div>
                <div className="truncate text-sm text-slate-500">{count(p.id)} ท่า{p.description ? ` · ${p.description}` : ''}</div>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => void copy(p)}>คัดลอก</Button>
              <Button size="sm" variant="ghost" onClick={() => void remove(p)}>ลบ</Button>
            </div>
          </Card>
        ))}
        {!list.length && <Empty>ยังไม่มีโปรแกรม</Empty>}
      </div>

      <RotationEditor programs={list.filter((p) => !p.is_warmup)} />
      <ScheduleEditor />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="โปรแกรมใหม่"
        footer={<><Button variant="secondary" block onClick={() => setCreating(false)}>ยกเลิก</Button><Button block onClick={create}>สร้าง</Button></>}
      >
        <Input label="ชื่อโปรแกรม" placeholder="เช่น C, D, Upper, Rehab" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Modal>
    </div>
  )
}

function RotationEditor({ programs }: { programs: WeightProgram[] }) {
  const qc = useQueryClient()
  const rotation = useRotation()
  const [adding, setAdding] = useState('')
  const rows = rotation.data ?? []
  const byId = new Map(programs.map((p) => [p.id, p]))
  const refresh = () => qc.invalidateQueries({ queryKey: qk.rotation })

  const reorder = async (next: typeof rows) => {
    await upsertRows('weight_rotation', next.map((r, i) => ({ id: r.id, program_id: r.program_id, sort_order: i + 1 })))
    await refresh()
  }
  const add = async () => {
    if (!adding) return
    await upsertRows('weight_rotation', [{ program_id: adding, sort_order: rows.length + 1 }])
    setAdding('')
    await refresh()
  }
  const remove = async (id: string) => {
    await deleteRows('weight_rotation', [id])
    await refresh()
  }

  return (
    <Card title="🔁 ลำดับวนโปรแกรม (Rotation)">
      <p className="mb-2 text-sm text-slate-500">วันเวทจะใช้โปรแกรมถัดไปจาก session ล่าสุด: {rows.map((r) => byId.get(r.program_id)?.name).join(' → ')} → วนกลับ</p>
      <SortableList
        items={rows}
        keyOf={(r) => r.id}
        onReorder={(n) => void reorder(n)}
        render={(r, handle, i) => (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1 dark:bg-slate-800/60">
            {handle}
            <span className="font-bold text-slate-400">{i + 1}</span>
            <span className="size-3 rounded-full" style={{ background: byId.get(r.program_id)?.color }} />
            <span className="flex-1 font-semibold">{byId.get(r.program_id)?.name ?? '(ถูกลบ)'}</span>
            <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>ลบ</Button>
          </div>
        )}
      />
      <div className="mt-2 flex gap-2">
        <Select className="flex-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">+ เพิ่มโปรแกรมเข้า rotation</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button disabled={!adding} onClick={add}>เพิ่ม</Button>
      </div>
    </Card>
  )
}

const ACTIVITY_TH: Record<Activity, string> = { weight: 'เวท', run: 'วิ่ง', rest: 'พัก', active_recovery: 'Active recovery' }

function ScheduleEditor() {
  const qc = useQueryClient()
  const schedule = useSchedule()
  const rows = schedule.data ?? []
  const update = async (row: WeeklySchedule, activity: Activity, runType?: 'easy' | 'interval' | 'long') => {
    const rt = activity === 'run' ? (runType ?? (row.run_type as 'easy' | 'interval' | 'long' | null) ?? 'easy') : null
    const tpl = rt ? FREE_RUN_TEMPLATES[rt] : null
    await updateRows('weekly_schedule', [row.id], { activity, run_type: rt, title: tpl?.title ?? null, segments: tpl?.segments ?? [] })
    await qc.invalidateQueries({ queryKey: qk.schedule })
    await qc.invalidateQueries({ queryKey: ['today_plan'] })
  }
  return (
    <Card title="🗓 ตารางประจำสัปดาห์">
      <p className="mb-2 text-sm text-slate-500">ใช้เมื่อไม่มีแผนวิ่งที่กำลังทำอยู่</p>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
          const row = rows.find((r) => r.day_of_week === dow)
          if (!row) return null
          return (
            <div key={dow} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
              <span className="font-bold">{THAI_DOW_SHORT[dow]}</span>
              <Select value={row.activity} onChange={(e) => void update(row, e.target.value as Activity)}>
                {Object.entries(ACTIVITY_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              {row.activity === 'run' ? (
                <Select value={row.run_type ?? 'easy'} onChange={(e) => void update(row, 'run', e.target.value as 'easy' | 'interval' | 'long')}>
                  <option value="easy">Easy</option>
                  <option value="interval">Interval</option>
                  <option value="long">Long</option>
                </Select>
              ) : <span />}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
