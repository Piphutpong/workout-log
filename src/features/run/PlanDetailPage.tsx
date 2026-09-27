import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  qk, useActiveEnrollment, useDayMarks, usePlanDays, useRecentRuns, useRecentWeightSessions, useRunPlans, useSettings,
} from '@/lib/api'
import { planDateOf, repeatSourceDayNo } from '@/lib/calc'
import { fmtDayMonth, todayIso } from '@/lib/date'
import { deleteRows, updateRows } from '@/lib/offline/queue'
import { Badge, Button, ErrorBox, Input, Select, Spinner, Textarea, cx } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import type { RunPlanDay, Segment, WorkoutType } from '@/types/database'
import { WORKOUT_COLOR, WORKOUT_TH } from './runMeta'
import { SegmentList } from './SegmentList'
import { downloadJson, exportPlan, savePlanAsMine } from './planIo'

type Mark = 'full' | 'partial' | 'skipped'
const MARK_ICON: Record<Mark, string> = { full: '✓', partial: '◐', skipped: '✗' }

export function PlanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const plans = useRunPlans()
  const days = usePlanDays(id)
  const enrollment = useActiveEnrollment()
  const runs = useRecentRuns()
  const marks = useDayMarks()
  const sessions = useRecentWeightSessions()
  const settings = useSettings()
  const [open, setOpen] = useState<RunPlanDay | null>(null)
  const [editing, setEditing] = useState<RunPlanDay | null>(null)

  const plan = plans.data?.find((p) => p.id === id)
  const enr = enrollment.data?.active?.plan_id === id ? enrollment.data?.active ?? null : null
  const today = todayIso()
  const own = Boolean(plan?.user_id)

  const markOf = useMemo(() => {
    const m = new Map<string, Mark>()
    if (!enr) return m
    for (const d of days.data ?? []) {
      const run = runs.data?.find((r) => r.plan_day_id === d.id)
      if (run) m.set(d.id, run.completed)
      else if (marks.data?.some((x) => x.plan_day_id === d.id && x.status === 'skipped')) m.set(d.id, 'skipped')
      else if (d.workout_type === 'weights' && sessions.data?.some((s) => s.date === planDateOf(d.day_no, enr.start_date, enr.day_offset))) m.set(d.id, 'full')
    }
    return m
  }, [enr, days.data, runs.data, marks.data, sessions.data])

  if (plans.isLoading || days.isLoading) return <Spinner />
  if (!plan) return <ErrorBox error={new Error('ไม่พบแผน')} />
  const list = days.data ?? []
  const byNo = new Map(list.map((d) => [d.day_no, d]))
  const resolve = (d: RunPlanDay) => (d.repeat_of_week ? byNo.get(repeatSourceDayNo(d.day_no, d.week_no, d.repeat_of_week)) : undefined)
  const reviewCount = list.filter((d) => d.note === 'ตรวจสอบ').length

  const copy = async () => {
    const newId = await savePlanAsMine(exportPlan(plan, list).plans[0], `${plan.name} (ของฉัน)`)
    await qc.invalidateQueries({ queryKey: qk.runPlans })
    toast('คัดลอกแผนแล้ว แก้รายวันได้ในแผนของฉัน')
    navigate(`/plans/${newId}`)
  }

  const remove = async () => {
    if (!(await confirmDialog(`ลบแผน ${plan.name}?`, { danger: true, okText: 'ลบ' }))) return
    await deleteRows('run_plans', [plan.id])
    await qc.invalidateQueries({ queryKey: qk.runPlans })
    navigate('/plans')
  }

  return (
    <div className="space-y-4">
      <Link to="/plans" className="block text-sm text-blue-700 dark:text-blue-300">← แผนทั้งหมด</Link>
      <div>
        <h1 className="text-2xl font-bold">{plan.name}</h1>
        <p className="text-sm text-slate-500">
          {plan.level === 'begin' ? 'Begin' : 'Performance'} · {plan.total_days} วัน{plan.source ? ` · ${plan.source}` : ''}
          {plan.note ? ` · ${plan.note}` : ''}
        </p>
        {enr && <Badge color="blue" className="mt-1">กำลังทำ · Day 1 = {fmtDayMonth(enr.start_date)}</Badge>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>คัดลอกเป็นของฉัน</Button>
        <Button size="sm" variant="secondary" onClick={() => downloadJson(`${plan.name.replace(/\s+/g, '_')}.json`, exportPlan(plan, list))}>Export JSON</Button>
        {own && <Button size="sm" variant="ghost" onClick={remove}>ลบแผน</Button>}
      </div>
      {reviewCount > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ มี {reviewCount} วันที่ถอดจากรูปแบบตีความ (ขอบสีเหลือง) — แตะเพื่อดูเหตุผล
        </p>
      )}

      <div className="grid grid-cols-6 gap-1">
        {list.map((d) => {
          const src = resolve(d)
          const type = (src?.workout_type ?? d.workout_type) as WorkoutType
          const date = enr ? planDateOf(d.day_no, enr.start_date, enr.day_offset) : null
          const mark = markOf.get(d.id)
          const isToday = date === today
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setOpen(d)}
              className={cx(
                'relative flex min-h-20 flex-col rounded-lg p-1 text-left text-[10px] leading-tight',
                WORKOUT_COLOR[type],
                d.note === 'ตรวจสอบ' && 'ring-2 ring-amber-400',
                isToday && 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-950',
              )}
            >
              {(d.day_no - 1) % 7 === 0 && (
                <span className="absolute -top-1 right-0 rounded bg-blue-600 px-1 text-[9px] font-bold text-white">W{d.week_no}</span>
              )}
              <span className="text-xs font-bold">D{d.day_no}</span>
              <span className="line-clamp-3 break-words">{d.repeat_of_week ? `ซ้ำ W${d.repeat_of_week}` : shortTitle(d)}</span>
              {d.add_weights && <span>+เวท</span>}
              {date && <span className="mt-auto opacity-70">{fmtDayMonth(date)}</span>}
              {mark && (
                <span className={cx('absolute right-0.5 bottom-0.5 text-base font-bold', mark === 'full' ? 'text-emerald-700' : mark === 'partial' ? 'text-amber-700' : 'text-red-700')}>
                  {MARK_ICON[mark]}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <Legend />

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={`Day ${open.day_no} · Week ${open.week_no}`}
          footer={own ? <Button block variant="secondary" onClick={() => { setEditing(open); setOpen(null) }}>แก้ไขวันนี้</Button> : undefined}
        >
          <DayDetail day={open} source={resolve(open)} maxHr={settings.data?.max_hr ?? 186} />
        </Modal>
      )}
      {editing && (
        <DayEditor
          day={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: qk.planDays(plan.id) })}
        />
      )}
    </div>
  )
}

function shortTitle(d: RunPlanDay) {
  return d.title.replace('Interval ', '').replace(' กม.', 'k').replace(' นาที', "'")
}

function Legend() {
  const types: WorkoutType[] = ['easy', 'long', 'interval', 'tempo', 'threshold', 'vo2max', 'walk_run', 'race_test', 'weights', 'active_recovery', 'rest']
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {types.map((t) => <span key={t} className={cx('rounded px-2 py-0.5', WORKOUT_COLOR[t])}>{WORKOUT_TH[t]}</span>)}
      <span className="px-2 py-0.5">✓ ครบ · ◐ บางส่วน · ✗ ข้าม</span>
    </div>
  )
}

function DayDetail({ day, source, maxHr }: { day: RunPlanDay; source?: RunPlanDay; maxHr: number }) {
  const eff = source ?? day
  return (
    <div className="space-y-3">
      <div>
        <span className={cx('rounded px-2 py-0.5 text-xs font-semibold', WORKOUT_COLOR[eff.workout_type])}>{WORKOUT_TH[eff.workout_type]}</span>
        <h3 className="mt-1 text-lg font-bold">{eff.title}</h3>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">📝 ต้นฉบับ: {day.description}</p>
      {source && <p className="text-sm text-slate-500">ทำซ้ำ Week {day.repeat_of_week} = Day {source.day_no}: {source.description}</p>}
      <SegmentList segments={eff.segments} maxHr={maxHr} />
      {(day.add_weights || source?.add_weights) && <p className="text-sm text-blue-700 dark:text-blue-300">+ บอดี้เวทหลังวิ่ง</p>}
      {(day.add_strides || source?.add_strides) && <p className="text-sm">+ Strides</p>}
      {day.note && (
        <p className={cx('text-sm', day.note === 'ตรวจสอบ' ? 'text-amber-600' : 'text-slate-500')}>
          {day.note === 'ตรวจสอบ' ? '⚠️ ตรวจสอบ: วันนี้อ่าน/แยกจากรูปไม่ชัด โปรดเทียบกับตารางต้นฉบับ' : `หมายเหตุ: ${day.note}`}
        </p>
      )}
    </div>
  )
}

const TYPES = Object.keys(WORKOUT_TH) as WorkoutType[]

/** เพิ่มช่วงการซ้อมแบบฟอร์ม เช่น 8 × 400 ม. @ 90-95% พักจ็อก 2 นาที */
function SegmentBuilder({ onAdd }: { onAdd: (s: Segment) => void }) {
  const [v, setV] = useState({ repeat: '1', work: '', unit: 'km', hrMin: '', hrMax: '', rec: '', recUnit: 'sec', recType: 'jog' })
  const cls = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-center dark:border-slate-700 dark:bg-slate-950'
  const add = () => {
    const w = Number(v.work)
    if (!w) return
    const s: Segment = { repeat: Math.max(1, Number(v.repeat) || 1), work_type: 'run' }
    if (v.unit === 'km') s.work_km = w
    else if (v.unit === 'm') s.work_m = w
    else s.work_sec = Math.round(w * 60)
    if (v.hrMin) { s.hr_min_pct = Number(v.hrMin); s.hr_max_pct = Number(v.hrMax || v.hrMin) }
    const r = Number(v.rec)
    if (r) {
      if (v.recUnit === 'm') s.recover_m = r
      else s.recover_sec = v.recUnit === 'min' ? Math.round(r * 60) : r
      s.recover_type = v.recType as Segment['recover_type']
    }
    onAdd(s)
    setV({ ...v, work: '', rec: '' })
  }
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="mb-2 text-sm font-semibold">+ เพิ่มช่วง (เที่ยว × ระยะ/เวลา)</div>
      <div className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-sm">
        <input className={cls} inputMode="numeric" value={v.repeat} onChange={set('repeat')} aria-label="จำนวนเที่ยว" />
        <input className={cls} inputMode="decimal" placeholder="ระยะ/เวลา" value={v.work} onChange={set('work')} />
        <select className={cls} value={v.unit} onChange={set('unit')}><option value="km">กม.</option><option value="m">ม.</option><option value="min">นาที</option></select>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2 text-sm">
        <input className={cls} inputMode="numeric" placeholder="HR ต่ำ %" value={v.hrMin} onChange={set('hrMin')} />
        <input className={cls} inputMode="numeric" placeholder="HR สูง %" value={v.hrMax} onChange={set('hrMax')} />
        <span className="text-xs text-slate-500">%MaxHR</span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_4.5rem_5rem] items-center gap-2 text-sm">
        <input className={cls} inputMode="decimal" placeholder="พัก (ไม่บังคับ)" value={v.rec} onChange={set('rec')} />
        <select className={cls} value={v.recUnit} onChange={set('recUnit')}><option value="sec">วิ</option><option value="min">นาที</option><option value="m">ม.</option></select>
        <select className={cls} value={v.recType} onChange={set('recType')}><option value="jog">จ็อก</option><option value="walk">เดิน</option><option value="rest">พัก</option></select>
      </div>
      <Button className="mt-2" size="sm" block variant="secondary" onClick={add}>เพิ่มช่วงนี้</Button>
    </div>
  )
}

function DayEditor({ day, onClose, onSaved }: { day: RunPlanDay; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({
    title: day.title,
    workout_type: day.workout_type,
    description: day.description ?? '',
    note: day.note ?? '',
    repeat_of_week: day.repeat_of_week ? String(day.repeat_of_week) : '',
    add_weights: day.add_weights,
    add_strides: day.add_strides,
    segments: JSON.stringify(day.segments, null, 1),
  })
  const [error, setError] = useState<unknown>(null)
  const save = async () => {
    setError(null)
    try {
      let segments: Segment[]
      try {
        segments = JSON.parse(f.segments || '[]')
        if (!Array.isArray(segments) || segments.some((s) => typeof s.repeat !== 'number')) throw new Error()
      } catch {
        throw new Error('segments ต้องเป็น JSON array และทุกช่วงต้องมี "repeat"')
      }
      await updateRows('run_plan_days', [day.id], {
        title: f.title, workout_type: f.workout_type, description: f.description || null, note: f.note || null,
        repeat_of_week: f.repeat_of_week ? Number(f.repeat_of_week) : null,
        add_weights: f.add_weights, add_strides: f.add_strides, segments,
      })
      await onSaved()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Modal open onClose={onClose} title={`แก้ Day ${day.day_no}`} footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={save}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อ" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Select label="ประเภท" value={f.workout_type} onChange={(e) => setF({ ...f, workout_type: e.target.value as WorkoutType })}>
          {TYPES.map((t) => <option key={t} value={t}>{WORKOUT_TH[t]}</option>)}
        </Select>
        <Textarea label="ข้อความต้นฉบับ" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ทำซ้ำ Week (ว่าง = ไม่ซ้ำ)" inputMode="numeric" value={f.repeat_of_week} onChange={(e) => setF({ ...f, repeat_of_week: e.target.value })} />
          <Input label="หมายเหตุ" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={f.add_weights} onChange={(e) => setF({ ...f, add_weights: e.target.checked })} /> บอดี้เวทหลังวิ่ง</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={f.add_strides} onChange={(e) => setF({ ...f, add_strides: e.target.checked })} /> Strides</label>
        <SegmentBuilder onAdd={(seg) => {
          let cur: Segment[] = []
          try { cur = JSON.parse(f.segments || '[]') } catch { cur = [] }
          setF({ ...f, segments: JSON.stringify([...cur, seg], null, 1) })
        }} />
        <Textarea label="Segments (JSON)" className="font-mono text-xs" rows={8} value={f.segments} onChange={(e) => setF({ ...f, segments: e.target.value })} />
        <p className="text-xs text-slate-500">
          เช่น {'[{"repeat":20,"work_m":100,"hr_min_pct":85,"hr_max_pct":90,"recover_m":100,"recover_type":"jog"}]'}
        </p>
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

