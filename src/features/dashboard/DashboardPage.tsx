import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAchievements, useDayActivity, useExercises, useGoalProgress, useGoals, useProgressCompare, useRecentPrs, useSettings,
  useWeeklySummary,
} from '@/lib/api'
import { addDays, fmtDate, fmtDayMonth, todayIso, weekStart } from '@/lib/date'
import { fmtPace } from '@/lib/calc'
import { Badge, Button, Card, Empty, ErrorBox, Segmented, Spinner, cx } from '@/components/ui'
import { ProgressBar } from '@/components/charts'
import { GoalCard } from '@/features/goals/GoalCard'
import { GoalCelebration, GoalForm } from '@/features/goals/GoalsPage'
import { PhotoCompare } from '@/features/body/PhotoCompare'
import { RUN_TYPE_TH } from '@/features/run/runMeta'
import type { CompareValue, Goal, WeeklyReview } from '@/types/database'
import { consistencyOf, pct, streakWeeks } from './consistency'
import { Heatmap } from './Heatmap'
import { computeReview, losingWeight, useEnsureWeeklyReview } from './weeklyReview'

export function DashboardPage() {
  const today = todayIso()
  const ws = weekStart(today)
  const monthStart = `${today.slice(0, 8)}01`
  const monthEnd = addDays(`${addDays(monthStart, 32).slice(0, 8)}01`, -1)
  const heatFrom = addDays(ws, -7 * 11)
  const actFrom = heatFrom < monthStart ? heatFrom : monthStart
  const actTo = addDays(ws, 6) > monthEnd ? addDays(ws, 6) : monthEnd

  const goals = useGoalProgress()
  const exercises = useExercises()
  const activity = useDayActivity(actFrom, actTo)
  const weekly = useWeeklySummary()
  const [next, setNext] = useState<Partial<Goal> | null>(null)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{fmtDate(today)}</p>
        <h1 className="text-2xl font-bold">ภาพรวม</h1>
      </div>

      {/* 1. เป้าหมาย */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🎯 เป้าหมาย</h2>
          <Link to="/goals" className="text-sm text-blue-700 dark:text-blue-300">จัดการ →</Link>
        </div>
        {goals.isLoading ? <Spinner /> : <ErrorBox error={goals.error} />}
        {(goals.data ?? []).filter((g) => g.status === 'active').map((g) => (
          <Link key={g.goal_id} to="/goals" className="block"><GoalCard g={g} exercises={exercises.data} /></Link>
        ))}
      </section>

      {/* 2. ความสม่ำเสมอ */}
      <Card title="🔥 ความสม่ำเสมอ">
        {activity.data ? (
          <ConsistencySection
            days={activity.data}
            ws={ws}
            monthStart={monthStart}
            monthEnd={monthEnd}
            heatFrom={heatFrom}
            streak={streakWeeks(weekly.data ?? [], ws)}
            proteinDays={Number(weekly.data?.find((w) => w.week_start === ws)?.protein_days_hit ?? 0)}
            foodDays={Number(weekly.data?.find((w) => w.week_start === ws)?.food_days ?? 0)}
          />
        ) : activity.error ? <ErrorBox error={activity.error} /> : <Spinner />}
      </Card>

      {/* 3. พัฒนาการ */}
      <ProgressSection />

      {/* 4. สรุปรายสัปดาห์ */}
      <WeeklyReviewSection />

      {/* 5. PR + Achievements */}
      <PrSection />

      {/* 6. รูปก่อน-หลัง */}
      <PhotoCompare />

      <div className="grid grid-cols-2 gap-2">
        <Link to="/progress"><Button block variant="secondary">📈 กราฟละเอียด</Button></Link>
        <Link to="/history"><Button block variant="secondary">🗂 ประวัติ</Button></Link>
      </div>

      <GoalCelebration rows={goals.data ?? []} onNext={setNext} />
      {next && <GoalForm goal={next} onClose={() => setNext(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ConsistencySection({ days, ws, monthStart, monthEnd, heatFrom, streak, proteinDays, foodDays }: {
  days: import('@/types/database').DayActivity[]
  ws: string
  monthStart: string
  monthEnd: string
  heatFrom: string
  streak: number
  proteinDays: number
  foodDays: number
}) {
  const week = consistencyOf(days, ws, addDays(ws, 6))
  const month = consistencyOf(days, monthStart, monthEnd)
  const heat = days.filter((d) => d.date >= heatFrom && d.date <= addDays(ws, 6))
  const Row = ({ label, c }: { label: string; c: { done: number; planned: number } }) => {
    const p = pct(c.done, c.planned)
    return (
      <div>
        <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{c.done}/{c.planned}{p != null ? ` (${p}%)` : ''}</span></div>
        <ProgressBar pct={p ?? 0} tone={p != null && p >= 80 ? 'green' : 'blue'} />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <div className="text-2xl font-bold">{streak}</div>
          <div className="text-xs text-slate-500">Streak (สัปดาห์ ≥ 5 วัน)</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <div className="text-2xl font-bold">{week.activeDays}</div>
          <div className="text-xs text-slate-500">วันออกกำลังสัปดาห์นี้</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
          <div className="text-2xl font-bold">{foodDays ? proteinDays : '-'}</div>
          <div className="text-xs text-slate-500">{foodDays ? 'วันถึงเป้าโปรตีน' : 'ยังไม่บันทึกอาหาร'}</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-500">สัปดาห์นี้</div>
          <Row label="🏋️ เวท" c={week.weight} />
          <Row label="🏃 วิ่ง" c={week.run} />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-500">เดือนนี้</div>
          <Row label="🏋️ เวท" c={month.weight} />
          <Row label="🏃 วิ่ง" c={month.run} />
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold text-slate-500">12 สัปดาห์ล่าสุด</div>
        <Heatmap days={heat} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
type RefMode = '4w' | 'start' | 'first'

function Delta({ v, fmt = (n) => n.toFixed(1), unit = '', pctMode }: { v: CompareValue; fmt?: (n: number) => string; unit?: string; pctMode?: boolean }) {
  const cur = v.current != null ? Number(v.current) : null
  const ref = v.ref != null ? Number(v.ref) : null
  if (cur == null && ref == null) return <span className="text-slate-400">-</span>
  const diff = cur != null && ref != null ? cur - ref : null
  const better = diff == null || diff === 0 ? null : v.good === 'up' ? diff > 0 : v.good === 'down' ? diff < 0 : null
  return (
    <span className="tabular-nums">
      <span className="text-slate-500">{ref != null ? fmt(ref) : '-'} → </span>
      <b>{cur != null ? fmt(cur) : '-'}</b>{unit && <span className="text-slate-500"> {unit}</span>}
      {diff != null && diff !== 0 && (
        <span className={cx('ml-1 text-sm', better === true && 'text-emerald-600', better === false && 'text-amber-600')}>
          {diff > 0 ? '▲' : '▼'}{pctMode && ref ? `${Math.abs((diff / ref) * 100).toFixed(1)}%` : fmt(Math.abs(diff))}
        </span>
      )}
    </span>
  )
}

function ProgressSection() {
  const settings = useSettings()
  const [mode, setMode] = useState<RefMode>('4w')
  const ref = mode === '4w' ? addDays(todayIso(), -28) : mode === 'start' ? (settings.data?.program_start_date ?? null) : null
  const cmp = useProgressCompare(ref)
  const d = cmp.data
  const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <li className="flex items-center justify-between gap-2 py-1.5"><span className="text-sm">{label}</span>{children}</li>
  )
  const lifts = (d?.lifts.exercises ?? [])
    .filter((e) => e.current != null && e.ref != null)
    .map((e) => ({ ...e, change: (Number(e.current) - Number(e.ref)) / Number(e.ref) }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6)
  return (
    <Card title="📈 พัฒนาการ">
      <Segmented value={mode} onChange={setMode} options={[{ value: '4w', label: '4 สัปดาห์ก่อน' }, { value: 'start', label: 'วันเริ่มโปรแกรม' }, { value: 'first', label: 'ครั้งแรก' }]} />
      {!d ? <Spinner /> : (
        <div className="mt-3 space-y-3">
          <div>
            <h3 className="font-semibold">ร่างกาย</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              <Line label="น้ำหนัก (เฉลี่ย 7 วัน)"><Delta v={d.body.weight_kg} fmt={(n) => n.toFixed(2)} unit="กก." /></Line>
              <Line label="PBF"><Delta v={d.body.pbf_pct} unit="%" /></Line>
              <Line label="SMM"><Delta v={d.body.smm_kg} unit="กก." /></Line>
              <Line label="รอบเอว"><Delta v={d.body.waist_cm} unit="ซม." /></Line>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">เวท (e1RM สูงสุดในช่วง 4 สัปดาห์)</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lifts.map((e) => <Line key={e.exercise_id} label={e.name}><Delta v={{ current: e.current, ref: e.ref, good: 'up' }} pctMode unit="lb" /></Line>)}
              {!lifts.length && <li className="py-1.5 text-sm text-slate-500">ยังไม่มีข้อมูลพอเทียบ</li>}
              <Line label="Volume/สัปดาห์"><Delta v={{ ...d.lifts.weekly_volume, good: 'up' }} fmt={(n) => Math.round(n).toLocaleString()} unit="lb" pctMode /></Line>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">วิ่ง</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              <Line label="pace Easy"><Delta v={d.runs.easy_pace} fmt={fmtPace} unit="/กม." /></Line>
              <Line label={`pace ที่ HR ${d.runs.z2_pace.hr_min}-${d.runs.z2_pace.hr_max}`}><Delta v={d.runs.z2_pace} fmt={fmtPace} unit="/กม." /></Line>
              <Line label="ระยะ/สัปดาห์"><Delta v={d.runs.weekly_km} unit="กม." /></Line>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">ฟื้นตัว (เฉลี่ย 7 วัน)</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              <Line label="Resting HR"><Delta v={d.recovery.resting_hr} unit="bpm" /></Line>
              <Line label="ชั่วโมงนอน"><Delta v={d.recovery.sleep_hours} unit="ชม." /></Line>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">อาการเจ็บ (7 วัน เทียบสัปดาห์ก่อน)</h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.pain.map((p) => <Line key={p.part} label={p.part}><Delta v={p} unit="/10" /></Line>)}
              {!d.pain.length && <li className="py-1.5 text-sm text-slate-500">ไม่มีบันทึกอาการเจ็บ 2 สัปดาห์ล่าสุด</li>}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
function ReviewBody({ good, improve }: { good: string[]; improve: string[] }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">ทำได้ดี</div>
        <ul className="mt-1 space-y-1 text-sm">
          {good.map((t) => <li key={t}>✅ {t}</li>)}
          {!good.length && <li className="text-slate-500">—</li>}
        </ul>
      </div>
      <div>
        <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">ต้องปรับ</div>
        <ul className="mt-1 space-y-1 text-sm">
          {improve.map((t) => <li key={t}>⚠️ {t}</li>)}
          {!improve.length && <li className="text-slate-500">ไม่มี 👍</li>}
        </ul>
      </div>
    </div>
  )
}

function WeeklyReviewSection() {
  const reviews = useEnsureWeeklyReview()
  const goals = useGoals()
  const [showAll, setShowAll] = useState(false)
  const [live, setLive] = useState<{ good: string[]; improve: string[] } | null>(null)
  const [loadingLive, setLoadingLive] = useState(false)
  const list = reviews.data ?? []
  const latest: WeeklyReview | undefined = list[0]

  const preview = async () => {
    setLoadingLive(true)
    try {
      setLive(await computeReview(weekStart(todayIso()), losingWeight(goals.data)))
    } finally {
      setLoadingLive(false)
    }
  }

  return (
    <Card title="📝 สรุปรายสัปดาห์" action={<Button size="sm" variant="ghost" disabled={loadingLive} onClick={() => void preview()}>สัปดาห์นี้</Button>}>
      {live && (
        <div className="mb-3 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/40">
          <div className="mb-1 text-sm font-semibold">สัปดาห์นี้ (ระหว่างสัปดาห์)</div>
          <ReviewBody {...live} />
        </div>
      )}
      {latest ? (
        <>
          <div className="mb-2 text-sm text-slate-500">สัปดาห์ {fmtDate(latest.week_start)} - {fmtDate(addDays(latest.week_start, 6))}</div>
          <ReviewBody good={latest.good} improve={latest.improve} />
          {list.length > 1 && (
            <button type="button" className="mt-3 text-sm text-blue-700 dark:text-blue-300" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'ซ่อน' : `ดูย้อนหลัง (${list.length - 1} สัปดาห์)`}
            </button>
          )}
          {showAll && list.slice(1).map((r) => (
            <details key={r.id} className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <summary className="cursor-pointer text-sm font-semibold">สัปดาห์ {fmtDate(r.week_start)}</summary>
              <div className="mt-2"><ReviewBody good={r.good} improve={r.improve} /></div>
            </details>
          ))}
        </>
      ) : (
        <Empty>สรุปจะถูกสร้างอัตโนมัติทุกวันจันทร์ (ของสัปดาห์ที่ผ่านมา)</Empty>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
function PrSection() {
  const prs = useRecentPrs(30)
  const ach = useAchievements()
  const exercises = useExercises()
  const name = (id: string) => exercises.data?.find((e) => e.id === id)?.name ?? 'ท่า'
  const items = [
    ...(prs.data?.lifts ?? []).map((p) => ({
      date: p.date,
      text: p.max_seconds && p.prev_best_seconds != null && p.max_seconds > p.prev_best_seconds
        ? `${name(p.exercise_id)} ${p.max_seconds} วิ (เดิม ${p.prev_best_seconds})`
        : `${name(p.exercise_id)} e1RM ${p.e1rm_lb ?? '-'} lb${p.prev_best_e1rm ? ` (เดิม ${p.prev_best_e1rm})` : ''}`,
      icon: '🏋️',
    })),
    ...(prs.data?.runs ?? []).map((r) => ({
      date: r.date,
      text: r.kind === 'pace' ? `pace ${RUN_TYPE_TH[r.run_type]} ดีที่สุด ${fmtPace(r.pace_sec_per_km)}/กม.` : `วิ่งไกลที่สุด ${r.distance_km} กม.`,
      icon: '🏃',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)

  return (
    <Card title="🏆 PR ล่าสุด (30 วัน) & Achievements">
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => <li key={i}>{it.icon} <span className="text-slate-500">{fmtDayMonth(it.date)}</span> {it.text}</li>)}
        {!items.length && <li className="text-slate-500">ยังไม่มี PR ใน 30 วัน</li>}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(ach.data ?? []).map((a) => {
          const done = a.value >= a.target
          return (
            <div key={a.key} className={cx('rounded-xl p-2 text-center', done ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-slate-50 opacity-70 dark:bg-slate-800/60')}>
              <div className={cx('text-2xl', !done && 'grayscale')}>{a.icon}</div>
              <div className="text-xs font-semibold leading-tight">{a.title}</div>
              {!done && a.target > 1 && <div className="text-[11px] text-slate-500 tabular-nums">{a.value}/{a.target}</div>}
              {done && <Badge color="amber" className="mt-1">สำเร็จ</Badge>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
