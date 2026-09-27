import { useMemo, useState } from 'react'
import {
  useActiveEnrollment, useAllBodyWeights, useAllRuns, useBodyComp, useExerciseProgress, useGoals, usePainLog,
  usePersonalRecords, usePlanDays, useWeeklySummary, useWeeklyTraining,
} from '@/lib/api'
import { fmtDuration, fmtPace, linearRegression, planDateOf } from '@/lib/calc'
import { addDays, daysBetween, fmtDate, fmtDayMonth, todayIso } from '@/lib/date'
import { Card, Empty, PageTitle, Segmented, Select, Spinner, cx } from '@/components/ui'
import { BarChart, ChartCard, LineChart, ProgressBar, type Series } from '@/components/charts'
import { RUN_TYPE_TH } from '@/features/run/runMeta'
import type { RunType } from '@/types/database'

type Range = '30' | '90' | 'all'

function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function ProgressPage() {
  return (
    <div className="space-y-4">
      <PageTitle>ความก้าวหน้า</PageTitle>
      <WeightSection />
      <LiftSection />
      <RunSection />
      <BodyCompSection />
      <PainSection />
      <RecordsSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
function WeightSection() {
  const weights = useAllBodyWeights()
  const goals = useGoals()
  const [range, setRange] = useState<Range>('90')
  const today = todayIso()
  const rows = weights.data ?? []
  const goal = goals.data?.find((g) => g.metric === 'weight_kg' && g.status !== 'archived')

  const view = useMemo(() => {
    if (!rows.length) return null
    const first = rows[0].date
    const from = range === 'all' ? first : [first, addDays(today, -Number(range) + 1)].sort()[1]
    const dates = dateRange(from, today)
    const byDate = new Map(rows.map((r) => [r.date, Number(r.weight_kg)]))
    const daily = dates.map((d) => byDate.get(d) ?? null)
    const avg7 = dates.map((d) => {
      const vals = rows.filter((r) => r.date >= addDays(d, -6) && r.date <= d).map((r) => Number(r.weight_kg))
      return byDate.has(d) && vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
    })
    const goalLine = dates.map((d) => {
      if (!goal?.target_date || goal.start_value == null || d < goal.start_date || d > goal.target_date) return null
      const t = daysBetween(goal.start_date, d) / Math.max(1, daysBetween(goal.start_date, goal.target_date))
      return Math.round((Number(goal.start_value) + (Number(goal.target_value) - Number(goal.start_value)) * t) * 100) / 100
    })
    // อัตราต่อสัปดาห์จาก regression 28 วันล่าสุด
    const recent = rows.filter((r) => r.date >= addDays(today, -27))
    const reg = recent.length >= 4 ? linearRegression(recent.map((r) => ({ x: daysBetween(today, r.date), y: Number(r.weight_kg) }))) : null
    return { labels: dates.map(fmtDayMonth), daily, avg7, goalLine, weekly: reg ? reg.slope * 7 : null }
  }, [rows, range, today, goal])

  const series: Series[] = view ? [
    { label: 'รายวัน', data: view.daily, slot: 'ref', dotsOnly: true },
    { label: 'เฉลี่ย 7 วัน', data: view.avg7, slot: 0 },
    ...(view.goalLine.some((v) => v != null) ? [{ label: 'เส้นเป้าหมาย', data: view.goalLine, slot: 1 as const, dashed: true }] : []),
  ] : []

  return (
    <ChartCard
      title="⚖️ น้ำหนักตัว (กก.)"
      labels={view?.labels ?? []}
      series={series}
      empty={!view}
      action={<Segmented className="!p-0.5" value={range} onChange={setRange} options={[{ value: '30', label: '30ว' }, { value: '90', label: '90ว' }, { value: 'all', label: 'ทั้งหมด' }]} />}
    >
      {view && (
        <>
          <LineChart labels={view.labels} series={series} />
          {view.weekly != null && (
            <p className={cx('mt-2 text-sm', view.weekly < -0.5 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300')}>
              อัตราเปลี่ยนแปลง 28 วันล่าสุด: <b>{view.weekly > 0 ? '+' : ''}{view.weekly.toFixed(2)} กก./สัปดาห์</b>
              {view.weekly < -0.5 && ' (เร็วกว่า 0.5 — เสี่ยงเสียกล้าม)'}
            </p>
          )}
        </>
      )}
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
function LiftSection() {
  const records = usePersonalRecords()
  const weekly = useWeeklyTraining()
  const list = (records.data?.exercises ?? []).filter((e) => e.measure_type !== 'band')
  const [exId, setExId] = useState('')
  const selected = exId || list[0]?.exercise_id
  const prog = useExerciseProgress(selected)
  const ex = list.find((e) => e.exercise_id === selected)
  const rows = prog.data ?? []
  const labels = rows.map((r) => fmtDayMonth(r.date))
  const isSec = ex?.measure_type === 'seconds'
  const strength: Series[] = isSec
    ? [{ label: 'เวลาสูงสุด (วิ)', data: rows.map((r) => r.max_seconds), slot: 0, points: true }]
    : [
        { label: 'น้ำหนักสูงสุด', data: rows.map((r) => r.max_weight_lb), slot: 0, points: true },
        { label: 'e1RM (Epley)', data: rows.map((r) => r.e1rm_lb), slot: 1, points: true },
      ]
  const volume: Series[] = [{ label: 'Volume (lb)', data: rows.map((r) => Number(r.volume_lb)), slot: 0 }]
  const wk = (weekly.data ?? []).slice(-16)
  const wkSeries: Series[] = [{ label: 'Volume/สัปดาห์ (lb)', data: wk.map((w) => Number(w.volume_lb)), slot: 0 }]

  return (
    <>
      <ChartCard
        title="🏋️ เวท"
        labels={labels}
        series={strength}
        empty={!list.length}
        action={list.length > 0 && (
          <Select className="w-44" value={selected} onChange={(e) => setExId(e.target.value)}>
            {list.map((e) => <option key={e.exercise_id} value={e.exercise_id}>{e.name}</option>)}
          </Select>
        )}
      >
        {prog.isLoading ? <Spinner /> : <LineChart labels={labels} series={strength} yTitle={isSec ? 'วินาที' : 'lb'} />}
        {!isSec && rows.length > 0 && (
          <>
            <div className="mt-3 text-sm font-semibold text-slate-500">Volume ต่อ session</div>
            <BarChart labels={labels} series={volume} height={150} />
          </>
        )}
      </ChartCard>
      <ChartCard title="Volume รวมต่อสัปดาห์" labels={wk.map((w) => fmtDayMonth(w.week_start))} series={wkSeries} empty={!wk.length}>
        <BarChart labels={wk.map((w) => fmtDayMonth(w.week_start))} series={wkSeries} yFormat={(v) => `${Math.round(v / 1000)}k`} />
      </ChartCard>
    </>
  )
}

// ---------------------------------------------------------------------------
function RunSection() {
  const runs = useAllRuns()
  const weekly = useWeeklySummary()
  const enrollment = useActiveEnrollment()
  const enr = enrollment.data?.active
  const planDays = usePlanDays(enr?.plan_id)
  const valid = (runs.data ?? []).filter((r) => r.completed !== 'skipped' && r.pace_sec_per_km != null)
  const types = [...new Set(valid.map((r) => r.run_type))] as RunType[]
  const [type, setType] = useState<RunType | ''>('')
  const t = type || (types.includes('easy') ? 'easy' : types[0])
  const ofType = valid.filter((r) => r.run_type === t)
  const labels = ofType.map((r) => fmtDayMonth(r.date))
  const pace: Series[] = [{ label: `pace ${t ? RUN_TYPE_TH[t] : ''}`, data: ofType.map((r) => Number(r.pace_sec_per_km)), slot: 0, points: true, format: (v) => `${fmtPace(v)}/กม.` }]
  const wk = (weekly.data ?? []).slice(-16)
  const km: Series[] = [{ label: 'กม./สัปดาห์', data: wk.map((w) => Number(w.run_km)), slot: 1 }]

  // % ความสำเร็จของแผนที่กำลังทำ (วันวิ่งที่ผ่านมาแล้ว)
  const completion = useMemo(() => {
    if (!enr || !planDays.data) return null
    const today = todayIso()
    const runDays = planDays.data.filter((d) => !['rest', 'weights', 'active_recovery'].includes(d.workout_type)
      && planDateOf(d.day_no, enr.start_date, enr.day_offset) <= today)
    if (!runDays.length) return null
    let score = 0
    for (const d of runDays) {
      const r = (runs.data ?? []).find((x) => x.plan_day_id === d.id)
      if (r?.completed === 'full') score += 1
      else if (r?.completed === 'partial') score += 0.5
    }
    return { pct: Math.round((score / runDays.length) * 100), done: score, total: runDays.length }
  }, [enr, planDays.data, runs.data])

  return (
    <>
      <ChartCard
        title="🏃 pace (เร็วอยู่ด้านบน)"
        labels={labels}
        series={pace}
        empty={!types.length}
        action={types.length > 0 && (
          <Select className="w-36" value={t} onChange={(e) => setType(e.target.value as RunType)}>
            {types.map((x) => <option key={x} value={x}>{RUN_TYPE_TH[x]}</option>)}
          </Select>
        )}
      >
        <LineChart labels={labels} series={pace} yReverse yFormat={fmtPace} />
      </ChartCard>
      <ChartCard title="ระยะวิ่งต่อสัปดาห์" labels={wk.map((w) => fmtDayMonth(w.week_start))} series={km} empty={!wk.some((w) => Number(w.run_km) > 0)}>
        <BarChart labels={wk.map((w) => fmtDayMonth(w.week_start))} series={km} yTitle="กม." />
      </ChartCard>
      {completion && (
        <Card title="✅ ความสำเร็จของแผนวิ่ง">
          <div className="flex justify-between text-sm"><span>วันวิ่งที่ผ่านมา {completion.total} วัน</span><b>{completion.pct}%</b></div>
          <ProgressBar pct={completion.pct} tone={completion.pct >= 80 ? 'green' : 'blue'} />
          <p className="mt-1 text-xs text-slate-500">ทำครบ = 1, บางส่วน = 0.5 (นับจากวิ่งที่บันทึกกับวันในแผน)</p>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
function BodyCompSection() {
  const comp = useBodyComp()
  const rows = [...(comp.data ?? [])].reverse()
  const labels = rows.map((r) => fmtDayMonth(r.date))
  const kg: Series[] = [
    { label: 'SMM (กก.)', data: rows.map((r) => r.smm_kg), slot: 0, points: true },
    { label: 'Body fat (กก.)', data: rows.map((r) => r.body_fat_kg), slot: 1, points: true },
  ]
  const pbf: Series[] = [{ label: 'PBF (%)', data: rows.map((r) => r.pbf_pct), slot: 0, points: true }]
  const waist: Series[] = [{ label: 'รอบเอว (ซม.)', data: rows.map((r) => r.waist_cm), slot: 0, points: true }]
  return (
    <ChartCard title="🧬 Body composition" labels={labels} series={[...kg, ...pbf, ...waist]} empty={!rows.length}>
      <LineChart labels={labels} series={kg} yTitle="กก." height={180} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><div className="text-sm font-semibold text-slate-500">PBF (%)</div><LineChart labels={labels} series={pbf} height={140} /></div>
        <div><div className="text-sm font-semibold text-slate-500">รอบเอว (ซม.)</div><LineChart labels={labels} series={waist} height={140} /></div>
      </div>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
function PainSection() {
  const pain = usePainLog()
  const parts = [...new Set((pain.data ?? []).map((p) => p.body_part))]
  const [part, setPart] = useState('')
  const p = part || parts[0]
  const rows = (pain.data ?? []).filter((x) => x.body_part === p).reverse()
  const labels = rows.map((r) => fmtDayMonth(r.date))
  const s: Series[] = [{ label: `เจ็บ${p ?? ''}`, data: rows.map((r) => r.score), slot: 0, points: true }]
  return (
    <ChartCard
      title="🩹 อาการเจ็บ (0-10)"
      labels={labels}
      series={s}
      empty={!parts.length}
      action={parts.length > 1 && (
        <Select className="w-32" value={p} onChange={(e) => setPart(e.target.value)}>
          {parts.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
      )}
    >
      <LineChart labels={labels} series={s} />
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
function RecordsSection() {
  const rec = usePersonalRecords()
  const r = rec.data
  if (!r) return <Card title="🏆 Personal records"><Spinner /></Card>
  const Time = ({ label, v }: { label: string; v: { sec: number; date: string } | null }) => (
    <div className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{v ? fmtDuration(v.sec) : '-'}</div>
      {v && <div className="text-[11px] text-slate-500">{fmtDate(v.date)}</div>}
    </div>
  )
  return (
    <Card title="🏆 Personal records">
      <div className="grid grid-cols-3 gap-2">
        <Time label="5K" v={r.best_5k} />
        <Time label="10K" v={r.best_10k} />
        <Time label="21K" v={r.best_21k} />
      </div>
      <p className="mt-1 text-xs text-slate-500">คิดจากวิ่งที่ระยะ X ถึง X+15% แล้วเทียบเวลาที่ระยะ X</p>
      <div className="mt-3 flex flex-wrap gap-x-4 text-sm">
        {r.longest && <span>ไกลที่สุด <b>{r.longest.distance_km} กม.</b> ({fmtDate(r.longest.date)})</span>}
      </div>
      {r.best_pace.length > 0 && (
        <ul className="mt-2 text-sm">
          {r.best_pace.map((b) => <li key={b.run_type}>pace ดีที่สุด {RUN_TYPE_TH[b.run_type]}: <b>{fmtPace(b.pace_sec_per_km)}/กม.</b> ({fmtDate(b.date)}, {b.distance_km} กม.)</li>)}
        </ul>
      )}
      <h3 className="mt-3 font-semibold">เวท</h3>
      {r.exercises.length ? (
        <table className="mt-1 w-full text-sm tabular-nums">
          <thead><tr className="text-left text-slate-500"><th className="py-1">ท่า</th><th className="text-right">สูงสุด</th><th className="text-right">e1RM</th></tr></thead>
          <tbody>
            {r.exercises.map((e) => (
              <tr key={e.exercise_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{e.name}</td>
                <td className="text-right">{e.measure_type === 'seconds' ? `${e.max_seconds ?? '-'} วิ` : e.max_weight_lb ? `${Number(e.max_weight_lb)} lb` : '-'}</td>
                <td className="text-right">{e.best_e1rm_lb ? Number(e.best_e1rm_lb) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>ยังไม่มีข้อมูล</Empty>}
    </Card>
  )
}
