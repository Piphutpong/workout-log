import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  invalidateDash, qk, useActiveEnrollment, useDayMarks, useRecentRuns, useRecentWeightSessions, useSettings, useTodayPlan,
} from '@/lib/api'
import { fmtLongDate, todayIso } from '@/lib/date'
import { deleteRows, updateRows, upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Card, ErrorBox, Spinner, cx } from '@/components/ui'
import { confirmDialog, toast } from '@/components/overlay'
import { SegmentList } from '@/features/run/SegmentList'
import { WORKOUT_TH, isHardRun } from '@/features/run/runMeta'
import { BodyWeightCard } from './BodyWeightCard'
import { CheckinCard } from './CheckinCard'
import { WeekMini } from './WeekMini'
import { NutritionMini } from './NutritionMini'
import { AlertsCard } from './AlertsCard'
import { WarmupChecklist } from './WarmupChecklist'

const ACTIVITY_ICON = { weight: '🏋️', run: '🏃', rest: '😴', active_recovery: '🧘' } as const
const ACTIVITY_TH = { weight: 'วันเวท', run: 'วันวิ่ง', rest: 'วันพัก', active_recovery: 'Active recovery' } as const
const DAY_TYPE_TH = { weight: 'เวท', run_easy: 'วิ่งเบา', run_hard: 'วิ่งหนัก', rest: 'พัก' } as const

export function TodayPage() {
  const today = todayIso()
  const qc = useQueryClient()
  const plan = useTodayPlan(today)
  const settings = useSettings()
  const enrollment = useActiveEnrollment()
  const runs = useRecentRuns()
  const sessions = useRecentWeightSessions()
  const marks = useDayMarks()

  if (plan.isLoading) return <Spinner />
  if (plan.error) return <ErrorBox error={plan.error} />
  const p = plan.data!
  const day = p.plan_day
  const maxHr = settings.data?.max_hr ?? 186
  const runToday = runs.data?.find((r) => r.date === today && r.completed !== 'skipped')
  const liftToday = sessions.data?.find((s) => s.date === today)
  const mark = marks.data?.find((m) => m.date === today)
  const isRunDay = p.activity === 'run'
  const wantsWeights = p.activity === 'weight' || Boolean(day?.add_weights)
  const enr = enrollment.data?.active

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['today_plan'] }),
    qc.invalidateQueries({ queryKey: qk.dayMarks }),
    qc.invalidateQueries({ queryKey: qk.enrollment }),
    invalidateDash(qc),
  ])

  const skip = async () => {
    if (!(await confirmDialog('ข้ามกิจกรรมวันนี้? (แผนจะเดินต่อตามปกติ)'))) return
    await upsertRows('day_marks', [{ date: today, status: 'skipped', activity: p.activity, plan_day_id: day?.id ?? null }], 'user_id,date')
    await refresh()
    toast('ข้ามวันนี้แล้ว')
  }

  const postpone = async () => {
    if (!enr) return
    if (!(await confirmDialog('เลื่อนแผนออกไป 1 วัน? วันนี้จะเป็นวันว่าง และพรุ่งนี้จะทำของวันนี้แทน'))) return
    await updateRows('plan_enrollments', [enr.id], { day_offset: enr.day_offset + 1 })
    await upsertRows('day_marks', [{ date: today, status: 'postponed', activity: p.activity, plan_day_id: day?.id ?? null }], 'user_id,date')
    await refresh()
    toast('เลื่อนแผนแล้ว')
  }

  const undoMark = async () => {
    if (!mark) return
    if (mark.status === 'postponed' && enr) await updateRows('plan_enrollments', [enr.id], { day_offset: Math.max(0, enr.day_offset - 1) })
    await deleteRows('day_marks', [mark.id])
    await refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{fmtLongDate(today)}</p>
        <h1 className="text-2xl font-bold">วันนี้</h1>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="text-4xl">{ACTIVITY_ICON[p.activity]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">{ACTIVITY_TH[p.activity]}</span>
              <Badge color="violet">เป้าโภชนาการ: {DAY_TYPE_TH[p.day_type]}</Badge>
              {mark && <Badge color="amber">{mark.status === 'skipped' ? '✗ ข้ามแล้ว' : '↷ เลื่อนแผนแล้ว'}</Badge>}
            </div>
            {p.plan && p.source === 'plan' && (
              <p className="mt-1 font-semibold text-blue-700 dark:text-blue-300">
                {p.plan.plan_name} · วันที่ {p.plan.day_no}/{p.plan.total_days}
                {day?.week_no ? ` · Week ${day.week_no}` : ''}
              </p>
            )}
            {p.plan?.status === 'not_started' && <p className="mt-1 text-sm text-slate-500">แผน {p.plan.plan_name} ยังไม่เริ่ม (ใช้ตารางประจำสัปดาห์)</p>}
            {p.plan?.status === 'finished' && <p className="mt-1 text-sm text-emerald-600">🎉 จบแผน {p.plan.plan_name} แล้ว</p>}
            <h2 className="mt-1 text-xl font-bold">
              {day?.title ?? (p.activity === 'weight' ? `โปรแกรม ${p.weight_program?.name ?? '-'}` : ACTIVITY_TH[p.activity])}
            </h2>
            {day?.workout_type && day.workout_type !== 'rest' && (
              <p className="text-sm text-slate-500">{WORKOUT_TH[day.workout_type]}{day.add_weights ? ' + บอดี้เวทหลังวิ่ง' : ''}</p>
            )}
          </div>
        </div>

        {day?.description && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            📝 {day.description}
            {day.repeat_source_description && <span className="block">↳ Week {day.repeat_of_week}: {day.repeat_source_description}</span>}
          </p>
        )}
        {day?.note && (
          <p className={cx('mt-2 text-sm', day.note === 'ตรวจสอบ' ? 'text-amber-600' : 'text-slate-500')}>
            {day.note === 'ตรวจสอบ' ? '⚠️ วันนี้ถอดจากรูปแบบตีความ — ตรวจสอบกับตารางต้นฉบับ' : `หมายเหตุ: ${day.note}`}
          </p>
        )}
        {day?.segments && day.segments.length > 0 && <div className="mt-3"><SegmentList segments={day.segments} maxHr={maxHr} /></div>}

        <div className="mt-4 grid gap-2">
          {isRunDay && (
            runToday ? (
              <Link to="/run"><Button block variant="success">✓ บันทึกวิ่งแล้ว {runToday.distance_km ?? ''} กม.</Button></Link>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to="/run"><Button block size="lg">บันทึกวิ่ง</Button></Link>
                {day?.segments?.length ? <Link to="/run/timer"><Button block size="lg" variant="secondary">⏱ Timer</Button></Link> : <span />}
              </div>
            )
          )}
          {wantsWeights && (
            liftToday ? (
              <Link to="/workout"><Button block variant="success">✓ เล่นเวทแล้ววันนี้</Button></Link>
            ) : (
              <Link to={`/workout${p.weight_program ? `?program=${p.weight_program.id}` : ''}`}>
                <Button block size="lg" variant={isRunDay ? 'secondary' : 'primary'}>
                  {isRunDay ? '🏋️ บันทึกเวทต่อ' : '🏋️ เริ่มบันทึกเวท'}{p.weight_program ? ` (โปรแกรม ${p.weight_program.name})` : ''}
                </Button>
              </Link>
            )
          )}
          {mark ? (
            <Button variant="ghost" onClick={undoMark}>ยกเลิก{mark.status === 'skipped' ? 'การข้าม' : 'การเลื่อน'}</Button>
          ) : (p.activity !== 'rest' || p.source === 'plan') && !runToday && !liftToday && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={skip}>ข้ามวันนี้</Button>
              {p.source === 'plan' && enr && <Button variant="ghost" onClick={postpone}>เลื่อนแผน 1 วัน</Button>}
            </div>
          )}
        </div>
      </Card>

      {wantsWeights && !liftToday && <WarmupChecklist type="weight" date={today} />}
      {isRunDay && !runToday && <WarmupChecklist type={isHardRun(p.workout_type) ? 'run_hard' : 'run_easy'} date={today} />}

      <AlertsCard />
      <BodyWeightCard />
      <NutritionMini />
      <CheckinCard />
      <WeekMini />
    </div>
  )
}
