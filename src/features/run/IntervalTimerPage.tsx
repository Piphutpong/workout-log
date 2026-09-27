import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSettings, useTodayPlan } from '@/lib/api'
import { buildTimerSteps, fmtDuration, pctToBpm, totalTimerSec, type TimerStep } from '@/lib/calc'
import { alertDone, beep, keepAwake, unlockAudio, vibrate } from '@/lib/alerts'
import { todayIso } from '@/lib/date'
import { Button, Card, Empty, PageTitle, Segmented, Spinner, cx } from '@/components/ui'
import { FREE_RUN_TEMPLATES } from './runMeta'
import type { Segment } from '@/types/database'

const KIND_STYLE: Record<TimerStep['kind'], string> = {
  work: 'bg-orange-500 text-white',
  recover: 'bg-emerald-600 text-white',
  rest: 'bg-sky-600 text-white',
}

export function IntervalTimerPage() {
  const location = useLocation() as { state?: { segments?: Segment[]; title?: string } }
  const plan = useTodayPlan(todayIso())
  const settings = useSettings()
  const [pick, setPick] = useState<'min' | 'max'>('min')
  const [custom, setCustom] = useState<'plan' | 'easy' | 'interval' | 'long'>('plan')

  const source = useMemo(() => {
    if (location.state?.segments) return { title: location.state.title ?? 'Timer', segments: location.state.segments }
    const pd = plan.data?.plan_day
    if (custom === 'plan' && pd?.segments?.length) return { title: pd.title, segments: pd.segments }
    const t = FREE_RUN_TEMPLATES[custom === 'plan' ? 'interval' : custom]
    return { title: t.title, segments: t.segments }
  }, [location.state, plan.data, custom])

  const hasRange = source.segments.some((s) => s.repeat_max || s.work_sec_max || s.work_km_max || s.work_m_max || s.recover_sec_max)
  const steps = useMemo(() => buildTimerSteps(source.segments, pick), [source.segments, pick])
  const maxHr = settings.data?.max_hr ?? 186

  if (plan.isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/run"><Button size="sm" variant="secondary">บันทึกวิ่ง</Button></Link>}>Interval timer</PageTitle>
      {!location.state?.segments && (
        <Segmented
          value={custom}
          onChange={setCustom}
          options={[
            ...(plan.data?.plan_day?.segments?.length ? [{ value: 'plan' as const, label: 'วันนี้' }] : []),
            { value: 'easy', label: 'Easy' },
            { value: 'interval', label: 'Interval' },
            { value: 'long', label: 'Long' },
          ]}
        />
      )}
      <h2 className="text-lg font-bold">{source.title}</h2>
      {hasRange && (
        <Segmented value={pick} onChange={setPick} options={[{ value: 'min', label: 'ใช้ค่าต่ำของช่วง' }, { value: 'max', label: 'ใช้ค่าสูงของช่วง' }]} />
      )}
      {steps.length ? <Runner key={`${source.title}-${pick}-${custom}`} steps={steps} maxHr={maxHr} /> : <Empty>ไม่มีช่วงให้จับเวลา</Empty>}
    </div>
  )
}

function Runner({ steps, maxHr }: { steps: TimerStep[]; maxHr: number }) {
  const [idx, setIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  // time step: endAt; distance step: startedAt (นับขึ้น)
  const [endAt, setEndAt] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const lastBeep = useRef<number | null>(null)
  const step = steps[idx]
  const next = steps[idx + 1]

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [running])

  useEffect(() => {
    void keepAwake(running)
    return () => void keepAwake(false)
  }, [running])

  const startStep = (i: number, at = Date.now()) => {
    const s = steps[i]
    setIdx(i)
    lastBeep.current = null
    if (s.sec != null) {
      setEndAt(at + s.sec * 1000)
      setStartedAt(null)
    } else {
      setEndAt(null)
      setStartedAt(at)
    }
  }

  const advance = () => {
    if (idx + 1 >= steps.length) {
      setRunning(false)
      setFinished(true)
      alertDone()
      return
    }
    alertDone()
    startStep(idx + 1)
  }

  // เปลี่ยนช่วงอัตโนมัติเมื่อหมดเวลา + เสียงนับถอยหลัง 3-2-1
  useEffect(() => {
    if (!running || endAt == null) return
    const left = Math.ceil((endAt - now) / 1000)
    if (left <= 0) advance()
    else if (left <= 3 && lastBeep.current !== left) {
      lastBeep.current = left
      beep(1, 660, 90)
      vibrate(60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, running, endAt])

  const toggle = () => {
    unlockAudio()
    if (finished) return
    if (!running) {
      if (endAt == null && startedAt == null) startStep(idx)
      else if (pausedLeft != null) {
        if (step.sec != null) setEndAt(Date.now() + pausedLeft)
        else setStartedAt(Date.now() - pausedLeft)
        setPausedLeft(null)
      }
      setRunning(true)
    } else {
      setPausedLeft(step.sec != null ? (endAt ?? Date.now()) - Date.now() : Date.now() - (startedAt ?? Date.now()))
      setRunning(false)
    }
  }

  const reset = () => {
    setRunning(false)
    setFinished(false)
    setIdx(0)
    setEndAt(null)
    setStartedAt(null)
    setPausedLeft(null)
  }

  const left = step.sec != null
    ? Math.max(0, Math.ceil(((running ? endAt! : Date.now() + (pausedLeft ?? step.sec * 1000)) - (running ? now : Date.now())) / 1000))
    : null
  const elapsed = step.sec == null && (startedAt || pausedLeft != null)
    ? Math.floor((running ? now - startedAt! : pausedLeft ?? 0) / 1000)
    : 0
  const total = totalTimerSec(steps)
  const doneSec = totalTimerSec(steps.slice(0, idx)) + (step.sec != null && left != null ? step.sec - left : 0)

  if (finished) {
    return (
      <Card className="text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="mt-2 text-2xl font-bold">เสร็จแล้ว!</h2>
        <div className="mt-4 grid gap-2">
          <Link to="/run"><Button block size="lg">บันทึกผลวิ่ง</Button></Link>
          <Button variant="secondary" onClick={reset}>เริ่มใหม่</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className={cx('rounded-3xl p-6 text-center shadow-lg', KIND_STYLE[step.kind])}>
        <div className="text-lg font-semibold opacity-90">
          {step.label}{step.reps > 1 ? ` · เที่ยว ${step.rep}/${step.reps}` : ''}
        </div>
        <div className="my-2 text-7xl font-bold tabular-nums">
          {left != null ? fmtDuration(left) : fmtDuration(elapsed)}
        </div>
        {step.meters != null && <div className="text-2xl font-bold">{step.meters >= 1000 ? `${step.meters / 1000} กม.` : `${step.meters} ม.`}</div>}
        {step.sec == null && <div className="text-sm opacity-90">ช่วงระยะทาง — กด "ถัดไป" เมื่อครบ</div>}
        {step.hr && <div className="mt-1 text-sm opacity-90">HR {pctToBpm(step.hr.min, maxHr)}-{pctToBpm(step.hr.max, maxHr)} bpm ({step.hr.min}-{step.hr.max}%)</div>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="lg" onClick={reset}>รีเซ็ต</Button>
        <Button size="lg" variant={running ? 'danger' : 'success'} onClick={toggle}>{running ? 'พัก' : endAt || startedAt ? 'ต่อ' : 'เริ่ม'}</Button>
        <Button variant="secondary" size="lg" onClick={() => {
          if (running) return advance()
          setIdx(Math.min(idx + 1, steps.length - 1))
          setEndAt(null)
          setStartedAt(null)
          setPausedLeft(null)
        }}>ถัดไป</Button>
      </div>

      {next && (
        <p className="text-center text-slate-500">
          ถัดไป: {next.label} {next.sec != null ? fmtDuration(next.sec) : next.meters ? `${next.meters} ม.` : ''}
        </p>
      )}
      {total > 0 && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (doneSec / total) * 100)}%` }} />
          </div>
          <p className="mt-1 text-center text-xs text-slate-500">ช่วงที่ {idx + 1}/{steps.length} · เวลารวม (เฉพาะช่วงจับเวลา) {fmtDuration(total)}</p>
        </div>
      )}
      <p className="text-center text-xs text-slate-400">บน iPhone เสียงอาจไม่ดังถ้าเปิดโหมดเงียบ · ระบบจะพยายามกันจอดับระหว่างจับเวลา</p>
    </div>
  )
}
