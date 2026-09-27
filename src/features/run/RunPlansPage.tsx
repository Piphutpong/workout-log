import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useActiveEnrollment, useRunPlans, useSettings } from '@/lib/api'
import { hrZonesBpm, planDayNo } from '@/lib/calc'
import { fmtDate, todayIso } from '@/lib/date'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Card, ErrorBox, Input, PageTitle, Spinner } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import type { RunPlan } from '@/types/database'
import { parsePlanFile, savePlanAsMine } from './planIo'

export function RunPlansPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const plans = useRunPlans()
  const enrollment = useActiveEnrollment()
  const settings = useSettings()
  const [enrolling, setEnrolling] = useState<RunPlan | null>(null)
  const [importError, setImportError] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)

  if (plans.isLoading || enrollment.isLoading) return <Spinner />
  const active = enrollment.data?.active
  const activePlan = plans.data?.find((p) => p.id === active?.plan_id)
  const dayNo = active ? planDayNo(todayIso(), active.start_date, active.day_offset) : 0
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: qk.enrollment }),
    qc.invalidateQueries({ queryKey: ['today_plan'] }),
    qc.invalidateQueries({ queryKey: qk.runPlans }),
  ])

  const setStatus = async (status: 'active' | 'paused' | 'done') => {
    if (!active) return
    if (status === 'done' && !(await confirmDialog('เลิกใช้แผนนี้? (กลับไปใช้ตารางประจำสัปดาห์)', { danger: true, okText: 'เลิกแผน' }))) return
    await updateRows('plan_enrollments', [active.id], { status })
    await refresh()
  }

  const onImport = async (file: File) => {
    setImportError(null)
    try {
      const parsed = parsePlanFile(await file.text())
      const mine = (plans.data ?? []).filter((p) => p.user_id)
      for (const p of parsed) {
        const dup = mine.find((m) => m.name === p.name && m.total_days === p.total_days)
        if (dup && !(await confirmDialog(`มีแผน "${p.name}" อยู่แล้ว นำเข้าเป็นแผนใหม่ซ้ำอีกชุด?`))) continue
        await savePlanAsMine(p, dup ? `${p.name} (นำเข้า)` : p.name)
      }
      await refresh()
      toast(`นำเข้า ${parsed.length} แผนแล้ว`)
    } catch (e) {
      setImportError(e)
    }
  }

  const system = (plans.data ?? []).filter((p) => !p.user_id)
  const mine = (plans.data ?? []).filter((p) => p.user_id)

  return (
    <div className="space-y-4">
      <PageTitle>แผนวิ่ง</PageTitle>

      {active && activePlan ? (
        <Card title="🏁 แผนที่กำลังทำ">
          <Link to={`/plans/${activePlan.id}`} className="block">
            <div className="text-xl font-bold">{activePlan.name}</div>
            <div className="text-sm text-slate-500">
              เริ่ม {fmtDate(active.start_date)}{active.day_offset ? ` · เลื่อนแล้ว ${active.day_offset} วัน` : ''}
              {active.status === 'paused' && ' · หยุดชั่วคราว'}
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, (dayNo / activePlan.total_days) * 100))}%` }} />
            </div>
            <div className="mt-1 text-sm">
              {dayNo < 1 ? `เริ่มอีก ${1 - dayNo} วัน` : dayNo > activePlan.total_days ? 'จบแผนแล้ว 🎉' : `วันที่ ${dayNo}/${activePlan.total_days}`}
            </div>
          </Link>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Link to={`/plans/${activePlan.id}`}><Button block size="sm" variant="secondary">ปฏิทิน</Button></Link>
            <Button size="sm" variant="secondary" onClick={() => void setStatus('paused')}>หยุดชั่วคราว</Button>
            <Button size="sm" variant="ghost" onClick={() => void setStatus('done')}>เลิกแผน</Button>
          </div>
        </Card>
      ) : (
        enrollment.data?.all.find((e) => e.status === 'paused') && (
          <Card>
            <p>มีแผนที่หยุดไว้</p>
            <Button className="mt-2" onClick={async () => {
              const paused = enrollment.data!.all.find((e) => e.status === 'paused')!
              await updateRows('plan_enrollments', [paused.id], { status: 'active' })
              await refresh()
            }}>ทำต่อ</Button>
          </Card>
        )
      )}

      <Card title="แผน FASTBULL RUN">
        <PlanList plans={system} activeId={active?.plan_id} onEnroll={setEnrolling} />
        <p className="mt-2 text-xs text-slate-500">
          Begin = มือใหม่ (5K ภายใน 45 นาที / 10K 1:00-1:30 ชม. / 21K มากกว่า 2 ชม.) · Performance = ต้องการทำเวลา (10K &lt; 50 นาที / 21K &lt; 1:45-2:00 ชม.)
        </p>
      </Card>

      <Card
        title="แผนของฉัน"
        action={<div className="flex gap-2">
          <Button size="sm" onClick={() => setCreating(true)}>+ สร้างแผน</Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>นำเข้า JSON</Button>
        </div>}
      >
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImport(f)
          e.target.value = ''
        }} />
        <ErrorBox error={importError} />
        {mine.length ? <PlanList plans={mine} activeId={active?.plan_id} onEnroll={setEnrolling} /> : (
          <p className="text-sm text-slate-500">คัดลอกแผนจาก FASTBULL แล้วแก้รายวันได้ หรือนำเข้าไฟล์ JSON</p>
        )}
      </Card>

      <ZoneTable maxHr={settings.data?.max_hr ?? 186} />

      {creating && <NewPlanModal onClose={() => setCreating(false)} onCreated={async (id) => {
        await refresh()
        setCreating(false)
        navigate(`/plans/${id}`)
      }} />}

      {enrolling && (
        <EnrollModal
          plan={enrolling}
          hasActive={Boolean(active)}
          onClose={() => setEnrolling(null)}
          onDone={async (startDate) => {
            if (active) await updateRows('plan_enrollments', [active.id], { status: 'done' })
            await upsertRows('plan_enrollments', [{ plan_id: enrolling.id, start_date: startDate, status: 'active', day_offset: 0 }])
            await refresh()
            setEnrolling(null)
            toast(`เริ่มแผน ${enrolling.name} แล้ว`)
            navigate(`/plans/${enrolling.id}`)
          }}
        />
      )}
    </div>
  )
}

function PlanList({ plans, activeId, onEnroll }: { plans: RunPlan[]; activeId?: string; onEnroll: (p: RunPlan) => void }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {plans.map((p) => (
        <li key={p.id} className="flex items-center gap-2 py-2">
          <Link to={`/plans/${p.id}`} className="min-w-0 flex-1">
            <div className="font-semibold">
              {p.name} {p.id === activeId && <Badge color="blue">กำลังทำ</Badge>}
            </div>
            <div className="text-sm text-slate-500">
              <Badge color={p.level === 'begin' ? 'green' : 'amber'}>{p.level === 'begin' ? 'Begin' : 'Performance'}</Badge>{' '}
              {p.total_days} วัน{p.goal_distance_km ? ` · ${p.goal_distance_km} กม.` : ''}
            </div>
          </Link>
          {p.id !== activeId && <Button size="sm" onClick={() => onEnroll(p)}>เริ่มแผน</Button>}
        </li>
      ))}
    </ul>
  )
}

function EnrollModal({ plan, hasActive, onClose, onDone }: {
  plan: RunPlan
  hasActive: boolean
  onClose: () => void
  onDone: (startDate: string) => Promise<void>
}) {
  const [date, setDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={`เริ่มแผน ${plan.name}`}
      footer={<>
        <Button variant="secondary" block onClick={onClose}>ยกเลิก</Button>
        <Button block disabled={busy} onClick={async () => {
          setBusy(true)
          try { await onDone(date) } finally { setBusy(false) }
        }}>เริ่ม</Button>
      </>}
    >
      <Input label="วันเริ่ม (Day 1)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <p className="mt-2 text-sm text-slate-500">{plan.total_days} วัน · ระหว่างแผน หน้า "วันนี้" จะใช้ตารางจากแผนแทนตารางประจำสัปดาห์</p>
      {hasActive && <p className="mt-2 text-sm text-amber-600">แผนที่กำลังทำอยู่จะถูกปิด (status = done)</p>}
    </Modal>
  )
}

/** สร้างแผนเปล่า (ทุกวันเป็น "พัก") แล้วไปแก้รายวันในปฏิทิน */
function NewPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [f, setF] = useState({ name: '', level: 'begin' as 'begin' | 'performance', days: '84', km: '' })
  const [error, setError] = useState<unknown>(null)
  const create = async () => {
    setError(null)
    try {
      const n = Math.round(Number(f.days))
      if (!f.name.trim()) throw new Error('กรอกชื่อแผน')
      if (!(n >= 1 && n <= 400)) throw new Error('จำนวนวัน 1-400')
      const id = await savePlanAsMine({
        name: f.name.trim(), level: f.level, total_days: n, goal_distance_km: f.km ? Number(f.km) : null, source: 'สร้างเอง', note: null,
        days: Array.from({ length: n }, (_, i) => ({ day_no: i + 1, workout_type: 'rest' as const, title: 'พัก', segments: [] })),
      })
      toast('สร้างแผนแล้ว — แตะแต่ละวันในปฏิทินเพื่อแก้')
      await onCreated(id)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Modal open onClose={onClose} title="สร้างแผนวิ่งใหม่"
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void create()}>สร้าง</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อแผน" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น 10K ของฉัน" />
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">ระดับ</span>
            <select className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950" value={f.level}
              onChange={(e) => setF({ ...f, level: e.target.value as 'begin' | 'performance' })}>
              <option value="begin">Begin</option><option value="performance">Performance</option>
            </select>
          </label>
          <Input label="จำนวนวัน" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
          <Input label="ระยะเป้า (กม.)" inputMode="decimal" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} />
        </div>
        <p className="text-xs text-slate-500">ทุกวันเริ่มเป็น "พัก" แล้วแตะวันในปฏิทิน → แก้ไขวันนี้ · หรือคัดลอกแผน FASTBULL มาแก้จะเร็วกว่า</p>
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

export function ZoneTable({ maxHr }: { maxHr: number }) {
  return (
    <Card title={`❤️ Zone ชีพจร (MaxHR ${maxHr})`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500"><th className="py-1">Zone</th><th>%MaxHR</th><th className="text-right">bpm</th></tr>
        </thead>
        <tbody>
          {hrZonesBpm(maxHr).map((z) => (
            <tr key={z.zone} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2"><b>Z{z.zone}</b> <span className="text-slate-500">{z.name}</span></td>
              <td>{z.min}-{z.max}%</td>
              <td className="text-right font-semibold tabular-nums">{z.minBpm}-{z.maxBpm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
