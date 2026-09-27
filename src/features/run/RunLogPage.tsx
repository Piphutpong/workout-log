import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, qk, useLastRunByType, useRecentRuns, useSettings, useShoes, useTodayPlan } from '@/lib/api'
import { bpmToPct, fmtDuration, fmtPace, hrStatus, paceDelta, paceSecPerKm, parseDuration, planHrRange } from '@/lib/calc'
import { fmtDate, fmtDayMonth, nowTime, todayIso } from '@/lib/date'
import { upsertRows, uuid } from '@/lib/offline/queue'
import { optionalNumber, rangeWarnings } from '@/lib/validation'
import { Badge, Button, Card, Input, PageTitle, Segmented, Select, Spinner, Textarea, cx } from '@/components/ui'
import { confirmWarnings, toast } from '@/components/overlay'
import type { RunType } from '@/types/database'
import { RUN_TYPE_TH, runTypeFromWorkout } from './runMeta'
import { SegmentList } from './SegmentList'

const schema = z.object({
  date: z.string().min(10),
  time_of_day: z.string().optional(),
  run_type: z.string(),
  distance_km: optionalNumber,
  duration: z.string().refine((v) => v.trim() === '' || parseDuration(v) != null, 'รูปแบบเวลา เช่น 32:10 หรือ 1:02:05'),
  avg_hr: optionalNumber,
  max_hr: optionalNumber,
  rpe: optionalNumber,
  feeling: z.number().nullable(),
  completed: z.enum(['full', 'partial', 'skipped']),
  shoe_id: z.string().optional(),
  temp_c: optionalNumber,
  humidity_pct: optionalNumber,
  note: z.string().optional(),
})
type Form = z.input<typeof schema>

interface RepRow { distance_m: string; duration: string; avg_hr: string }
const FEELINGS = ['😫', '😕', '😐', '🙂', '🤩']
const INTERVAL_TYPES = ['interval', 'vo2max', 'threshold', 'tempo']

export function RunLogPage() {
  const today = todayIso()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const plan = useTodayPlan(today)
  const settings = useSettings()
  const shoes = useShoes()
  const recent = useRecentRuns()
  const lastByType = useLastRunByType()
  const [reps, setReps] = useState<RepRow[]>([])
  const [showReps, setShowReps] = useState(false)
  const [saving, setSaving] = useState(false)

  const planDay = plan.data?.activity === 'run' ? plan.data.plan_day : null
  const maxHr = settings.data?.max_hr ?? 186

  // รองเท้าที่ใช้บ่อยที่สุด
  const defaultShoe = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of recent.data ?? []) if (r.shoe_id) counts.set(r.shoe_id, (counts.get(r.shoe_id) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return top ?? shoes.data?.find((s) => s.active)?.id ?? ''
  }, [recent.data, shoes.data])

  const { register, handleSubmit, control, setValue, reset, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: today, time_of_day: nowTime(), run_type: 'easy', distance_km: null, duration: '', avg_hr: null, max_hr: null,
      rpe: null, feeling: null, completed: 'full', shoe_id: '', temp_c: null, humidity_pct: null, note: '',
    },
  })

  useEffect(() => {
    if (planDay) setValue('run_type', runTypeFromWorkout(planDay.workout_type))
  }, [planDay, setValue])
  useEffect(() => {
    if (defaultShoe) setValue('shoe_id', defaultShoe)
  }, [defaultShoe, setValue])

  const w = useWatch({ control })
  const durationSec = parseDuration(w.duration ?? '')
  const distance = Number(w.distance_km) || null
  const pace = paceSecPerKm(distance, durationSec)
  const last = lastByType.data?.get(w.run_type as RunType)
  const delta = paceDelta(pace, last?.pace_sec_per_km ?? null)
  const hrRange = planDay ? planHrRange(planDay.segments) : null
  const avgHr = Number(w.avg_hr) || null
  const status = avgHr && hrRange ? hrStatus(avgHr, maxHr, hrRange.min, hrRange.max) : null
  const isIntervalType = INTERVAL_TYPES.includes(w.run_type ?? '')

  // เตรียมแถวผลรายเที่ยวจาก segment แรกของแผน
  const openReps = () => {
    const seg = planDay?.segments.find((s) => s.repeat > 1)
    const n = seg?.repeat ?? 6
    const m = seg?.work_m ?? (seg?.work_km ? seg.work_km * 1000 : undefined)
    setReps(Array.from({ length: n }, () => ({ distance_m: m ? String(m) : '', duration: '', avg_hr: '' })))
    setShowReps(true)
  }

  if (plan.isLoading || settings.isLoading) return <Spinner />

  const onSubmit = async (f: Form) => {
    const parsed = schema.parse(f)
    const dur = parseDuration(parsed.duration)
    const p = paceSecPerKm(parsed.distance_km, dur)
    const warnings = rangeWarnings({
      distance_km: parsed.distance_km, hr: parsed.avg_hr, pace_sec: p,
      ...(parsed.max_hr ? { max_hr: parsed.max_hr } : {}),
    })
    if (parsed.completed !== 'skipped' && !parsed.distance_km && !dur) warnings.push('ยังไม่ได้กรอกระยะหรือเวลา')
    if (!(await confirmWarnings(warnings))) return
    setSaving(true)
    try {
      const id = uuid()
      const res = await upsertRows('runs', [{
        id,
        date: parsed.date,
        time_of_day: parsed.time_of_day || null,
        plan_day_id: parsed.date === today && plan.data?.source === 'plan' ? (planDay?.id ?? null) : null,
        run_type: parsed.run_type as RunType,
        distance_km: parsed.distance_km,
        duration_sec: dur,
        avg_hr: parsed.avg_hr,
        max_hr: parsed.max_hr,
        rpe: parsed.rpe,
        feeling: parsed.feeling,
        completed: parsed.completed,
        shoe_id: parsed.shoe_id || null,
        temp_c: parsed.temp_c,
        humidity_pct: parsed.humidity_pct,
        note: parsed.note || null,
      }])
      const repRows = showReps
        ? reps
            .map((r, i) => ({ rep_no: i + 1, distance_m: Number(r.distance_m) || null, duration_sec: parseDuration(r.duration), avg_hr: Number(r.avg_hr) || null }))
            .filter((r) => r.duration_sec || r.avg_hr)
        : []
      if (repRows.length) await upsertRows('run_intervals', repRows.map((r) => ({ ...r, run_id: id })))
      void qc.invalidateQueries({ queryKey: qk.runs })
      void qc.invalidateQueries({ queryKey: qk.lastRunByType })
      void qc.invalidateQueries({ queryKey: ['today_plan'] })
      void invalidateDash(qc)
      toast(res.queued ? 'บันทึกแล้ว (รอส่งเมื่อออนไลน์)' : 'บันทึกการวิ่งแล้ว 🏃')
      reset()
      navigate(planDay?.add_weights ? '/workout' : '/today')
    } catch (e) {
      toast(`บันทึกไม่สำเร็จ: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle action={<div className="flex gap-2"><Link to="/plans"><Button size="sm" variant="secondary">📅 แผน</Button></Link><Link to="/run/timer"><Button size="sm" variant="secondary">⏱ Timer</Button></Link></div>}>บันทึกวิ่ง</PageTitle>

      {planDay && (
        <Card>
          <p className="text-sm text-slate-500">
            {plan.data?.source === 'plan' ? `${plan.data.plan?.plan_name} · วันที่ ${plan.data.plan?.day_no}` : 'ตารางประจำสัปดาห์'}
          </p>
          <h2 className="mb-2 text-lg font-bold">{planDay.title}</h2>
          <SegmentList segments={planDay.segments} maxHr={maxHr} />
          {planDay.add_weights && <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">+ บอดี้เวทหลังวิ่ง (จะพาไปหน้าบันทึกเวทหลังบันทึก)</p>}
        </Card>
      )}

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Input label="วันที่" type="date" {...register('date')} />
            <Input label="เวลา" type="time" {...register('time_of_day')} />
          </div>
          <Select className="mt-3" label="ประเภท" {...register('run_type')}>
            {Object.entries(RUN_TYPE_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input label="ระยะ (กม.)" inputMode="decimal" placeholder="5.00" {...register('distance_km')} />
            <Input label="เวลา (นาที:วินาที)" inputMode="numeric" placeholder="32:10" {...register('duration')} error={formState.errors.duration?.message} />
          </div>

          <div className="mt-3 flex items-end justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <div>
              <div className="text-sm text-slate-500">Pace</div>
              <div className="text-3xl font-bold tabular-nums">{fmtPace(pace)} <span className="text-base font-normal text-slate-500">/กม.</span></div>
            </div>
            {delta != null && last && (
              <div className={cx('text-right text-sm', delta <= 0 ? 'text-emerald-600' : 'text-amber-600')}>
                <div className="font-bold">{delta <= 0 ? `เร็วขึ้น ${-delta}` : `ช้าลง ${delta}`} วิ/กม.</div>
                <div className="text-slate-500">
                  เทียบ {fmtDayMonth(last.date)} {fmtPace(last.pace_sec_per_km)}
                  {last.temp_c != null ? ` @ ${last.temp_c}°C` : ''}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title="❤️ ชีพจร">
          <div className="grid grid-cols-2 gap-3">
            <Input label="HR เฉลี่ย" inputMode="numeric" {...register('avg_hr')} />
            <Input label="HR สูงสุด" inputMode="numeric" {...register('max_hr')} />
          </div>
          {avgHr && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>{bpmToPct(avgHr, maxHr)}% MaxHR</span>
              {hrRange && <span className="text-slate-500">เป้า {hrRange.min}-{hrRange.max}%</span>}
              {status && (
                <Badge color={status === 'in' ? 'green' : status === 'low' ? 'blue' : 'red'}>
                  {status === 'in' ? 'อยู่ในช่วง' : status === 'low' ? 'ต่ำไป' : 'สูงไป'}
                </Badge>
              )}
            </div>
          )}
        </Card>

        {isIntervalType && (
          <Card title="ผลรายเที่ยว (ไม่บังคับ)" action={!showReps && <Button size="sm" variant="secondary" onClick={openReps}>บันทึกรายเที่ยว</Button>}>
            {showReps && (
              <div className="space-y-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 text-xs text-slate-500">
                  <span>#</span><span>ระยะ (ม.)</span><span>เวลา</span><span>HR</span>
                </div>
                {reps.map((r, i) => (
                  <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr] items-center gap-2">
                    <span className="font-bold text-slate-400">{i + 1}</span>
                    {(['distance_m', 'duration', 'avg_hr'] as const).map((k) => (
                      <input
                        key={k}
                        inputMode="numeric"
                        placeholder={k === 'duration' ? '0:45' : ''}
                        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-center dark:border-slate-700 dark:bg-slate-950"
                        value={r[k]}
                        onChange={(e) => setReps(reps.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                      />
                    ))}
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setReps([...reps, { ...(reps[reps.length - 1] ?? { distance_m: '', duration: '', avg_hr: '' }), duration: '', avg_hr: '' }])}>+ เที่ยว</Button>
              </div>
            )}
          </Card>
        )}

        <Card title="ความรู้สึก">
          <div className="grid grid-cols-5 gap-2">
            {FEELINGS.map((f, i) => (
              <button
                key={f}
                type="button"
                onClick={() => setValue('feeling', w.feeling === i + 1 ? null : i + 1)}
                className={cx('min-h-14 rounded-xl text-3xl', w.feeling === i + 1 ? 'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900' : 'bg-slate-100 dark:bg-slate-800')}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input label="RPE (1-10)" inputMode="decimal" {...register('rpe')} />
            <Select label="รองเท้า" {...register('shoe_id')}>
              <option value="">—</option>
              {(shoes.data ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="mt-3">
            <Segmented
              value={w.completed ?? 'full'}
              onChange={(v) => setValue('completed', v)}
              options={[{ value: 'full', label: '✓ ครบ' }, { value: 'partial', label: '◐ บางส่วน' }, { value: 'skipped', label: '✗ ข้าม' }]}
            />
          </div>
        </Card>

        <Card title="สภาพอากาศ">
          <div className="grid grid-cols-2 gap-3">
            <Input label="อุณหภูมิ (°C)" inputMode="decimal" {...register('temp_c')} />
            <Input label="ความชื้น (%)" inputMode="numeric" {...register('humidity_pct')} />
          </div>
        </Card>

        <Textarea label="โน้ต" {...register('note')} />
        <Button type="submit" block size="lg" variant="success" disabled={saving}>{saving ? 'กำลังบันทึก…' : '✓ บันทึกการวิ่ง'}</Button>
      </form>

      <Card title="วิ่งล่าสุด">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(recent.data ?? []).slice(0, 10).map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <b>{fmtDate(r.date)}</b> · {RUN_TYPE_TH[r.run_type]}
                {r.completed !== 'full' && <span className="ml-1">{r.completed === 'partial' ? '◐' : '✗'}</span>}
              </span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {r.distance_km ?? '-'} กม. · {fmtDuration(r.duration_sec)} · {fmtPace(r.pace_sec_per_km)}/กม.{r.avg_hr ? ` · ${r.avg_hr} bpm` : ''}
              </span>
            </li>
          ))}
          {!recent.data?.length && <li className="py-4 text-center text-slate-500">ยังไม่มีข้อมูล</li>}
        </ul>
      </Card>
    </div>
  )
}
