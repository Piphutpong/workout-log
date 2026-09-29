// สรุปผลต่างๆ (แทน SQL views/functions เดิม) — คำนวณจากข้อมูลในเครื่อง
import { addDays, daysBetween, weekStart } from '@/lib/date'
import { epley1RM, linearRegression } from '@/lib/calc'
import type {
  Achievement, DailyNutrition, DayActivity, ExerciseProgress, FoodUsage, GoalProgressRow, LastPerformance, LastRunByType,
  PersonalRecords, PrEvent, ProgressCompare, RunPrEvent, ShoeUsage, WeeklySummary, WeeklyTraining,
} from '@/types/database'
import type { WeeklyReviewStats } from '@/lib/rules'
import type { TdeeInputs } from '@/features/nutrition/nutritionCalc'
import { avg, byAsc, byDesc, groupBy, gt, max, num, round, sum, type Db } from './db'
import { todayPlan } from './plan'

const UID = 'owner'
const done = (r: { completed: string }) => r.completed !== 'skipped'

// ---------------------------------------------------------------------------
// เวท
// ---------------------------------------------------------------------------
export function lastPerformance(db: Db): Map<string, LastPerformance> {
  const out = new Map<string, LastPerformance>()
  const sets = db.rows('weight_sets')
  for (const [exId, list] of groupBy(sets, (s) => s.exercise_id)) {
    const latest = [...list].sort(byDesc((s) => s.date, (s) => s.created_at))[0]
    const same = list.filter((s) => s.session_id === latest.session_id).sort((a, b) => a.set_no - b.set_no)
    out.set(exId, {
      user_id: UID, exercise_id: exId, session_id: latest.session_id, date: latest.date,
      sets: same.map((s) => ({ set_no: s.set_no, weight_lb: num(s.weight_lb), reps: num(s.reps), seconds: num(s.seconds), band_level: s.band_level, rpe: num(s.rpe) })),
    })
  }
  return out
}

export function exerciseProgress(db: Db, exerciseId?: string): ExerciseProgress[] {
  const sets = db.rows('weight_sets').filter((s) => !exerciseId || s.exercise_id === exerciseId)
  const out: ExerciseProgress[] = []
  for (const list of groupBy(sets, (s) => `${s.exercise_id}|${s.session_id}`).values()) {
    const s0 = list[0]
    out.push({
      user_id: UID, exercise_id: s0.exercise_id, session_id: s0.session_id, date: s0.date,
      max_weight_lb: max(list.map((s) => s.weight_lb)),
      e1rm_lb: max(list.map((s) => epley1RM(num(s.weight_lb), num(s.reps)))),
      volume_lb: list.reduce((a, s) => a + (num(s.weight_lb) ?? 0) * (num(s.reps) ?? 0), 0),
      total_reps: list.reduce((a, s) => a + (num(s.reps) ?? 0), 0),
      max_seconds: max(list.map((s) => s.seconds)),
      set_count: list.length,
    })
  }
  return out.sort(byAsc((r) => r.date, (r) => r.session_id))
}

export function weeklyTraining(db: Db): WeeklyTraining[] {
  return [...groupBy(db.rows('weight_sets'), (s) => weekStart(s.date)).entries()]
    .map(([week_start, list]) => ({
      user_id: UID, week_start,
      volume_lb: list.reduce((a, s) => a + (num(s.weight_lb) ?? 0) * (num(s.reps) ?? 0), 0),
      sets: list.length,
      sessions: new Set(list.map((s) => s.session_id)).size,
    }))
    .sort(byAsc((w) => w.week_start))
}

export function prEvents(db: Db): PrEvent[] {
  const out: PrEvent[] = []
  for (const list of groupBy(exerciseProgress(db), (e) => e.exercise_id).values()) {
    let bestE: number | null = null, bestW: number | null = null, bestS: number | null = null
    list.forEach((e, i) => {
      if (i > 0 && (gt(e.e1rm_lb, bestE) || gt(e.max_weight_lb, bestW) || gt(e.max_seconds, bestS))) {
        out.push({ user_id: UID, exercise_id: e.exercise_id, session_id: e.session_id, date: e.date, max_weight_lb: e.max_weight_lb, e1rm_lb: e.e1rm_lb,
          max_seconds: e.max_seconds, prev_best_e1rm: bestE, prev_best_weight: bestW, prev_best_seconds: bestS })
      }
      bestE = max([bestE, e.e1rm_lb]); bestW = max([bestW, e.max_weight_lb]); bestS = max([bestS, e.max_seconds])
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// วิ่ง
// ---------------------------------------------------------------------------
export function lastRunByType(db: Db): Map<string, LastRunByType> {
  const out = new Map<string, LastRunByType>()
  const runs = db.rows('runs').filter((r) => done(r) && (num(r.distance_km) ?? 0) > 0).sort(byDesc((r) => r.date, (r) => r.created_at))
  for (const r of runs) {
    if (out.has(r.run_type)) continue
    out.set(r.run_type, { user_id: UID, run_type: r.run_type, run_id: r.id, date: r.date, distance_km: Number(r.distance_km), duration_sec: r.duration_sec,
      pace_sec_per_km: r.pace_sec_per_km, avg_hr: r.avg_hr, max_hr: r.max_hr, temp_c: r.temp_c, humidity_pct: r.humidity_pct })
  }
  return out
}

export function runPrEvents(db: Db): RunPrEvent[] {
  const runs = db.rows('runs').filter((r) => done(r) && (num(r.distance_km) ?? 0) >= 1 && r.pace_sec_per_km != null)
    .sort(byAsc((r) => r.date, (r) => r.created_at))
  const bestPace = new Map<string, number>()
  let longest: number | null = null
  const out: RunPrEvent[] = []
  for (const r of runs) {
    const prevPace = bestPace.get(r.run_type) ?? null
    const pace = Number(r.pace_sec_per_km), dist = Number(r.distance_km)
    const pacePr = prevPace != null && pace < prevPace
    if (pacePr || gt(dist, longest)) {
      out.push({ user_id: UID, run_id: r.id, date: r.date, run_type: r.run_type, distance_km: dist, pace_sec_per_km: pace, kind: pacePr ? 'pace' : 'distance' })
    }
    bestPace.set(r.run_type, prevPace == null ? pace : Math.min(prevPace, pace))
    longest = max([longest, dist])
  }
  return out
}

function bestTimeFor(db: Db, km: number) {
  const r = db.rows('runs')
    .filter((x) => done(x) && (num(x.duration_sec) ?? 0) > 0 && Number(x.distance_km) >= km && Number(x.distance_km) <= km * 1.15)
    .sort(byAsc((x) => Number(x.duration_sec) / Number(x.distance_km)))[0]
  return r ? { sec: Math.round((Number(r.duration_sec) * km) / Number(r.distance_km)), date: r.date, distance_km: Number(r.distance_km), run_id: r.id } : null
}

export function personalRecords(db: Db): PersonalRecords {
  const prog = exerciseProgress(db)
  const exercises = db.rows('exercises').flatMap((e) => {
    const list = prog.filter((p) => p.exercise_id === e.id)
    if (!list.length) return []
    const best = [...list].sort((a, b) => (b.e1rm_lb ?? -1) - (a.e1rm_lb ?? -1) || (b.max_seconds ?? -1) - (a.max_seconds ?? -1) || a.date.localeCompare(b.date))[0]
    return [{ exercise_id: e.id, name: e.name, measure_type: e.measure_type, max_weight_lb: max(list.map((p) => p.max_weight_lb)),
      best_e1rm_lb: max(list.map((p) => p.e1rm_lb)), max_seconds: max(list.map((p) => p.max_seconds)), best_date: best.date }]
  }).sort((a, b) => a.name.localeCompare(b.name))
  const runs = db.rows('runs').filter(done)
  const best_pace = [...groupBy(runs.filter((r) => r.pace_sec_per_km != null && Number(r.distance_km) >= 1), (r) => r.run_type).entries()]
    .map(([run_type, l]) => {
      const b = [...l].sort(byAsc((r) => Number(r.pace_sec_per_km)))[0]
      return { run_type, pace_sec_per_km: Number(b.pace_sec_per_km), date: b.date, distance_km: Number(b.distance_km) }
    }).sort((a, b) => a.run_type.localeCompare(b.run_type))
  const longestRun = runs.filter((r) => r.distance_km != null).sort((a, b) => Number(b.distance_km) - Number(a.distance_km) || a.date.localeCompare(b.date))[0]
  return {
    exercises, best_pace,
    longest: longestRun ? { distance_km: Number(longestRun.distance_km), date: longestRun.date, duration_sec: longestRun.duration_sec } : null,
    best_5k: bestTimeFor(db, 5), best_10k: bestTimeFor(db, 10), best_21k: bestTimeFor(db, 21.0975),
  }
}

export function shoeUsage(db: Db): Map<string, ShoeUsage> {
  const runs = db.rows('runs')
  return new Map(db.rows('shoes').map((s) => {
    const l = runs.filter((r) => r.shoe_id === s.id && done(r))
    return [s.id, { user_id: UID, shoe_id: s.id, km: round(Number(s.start_km) + sum(l.map((r) => r.distance_km)), 1)!, runs: l.length,
      last_used: l.map((r) => r.date).sort().at(-1) ?? null }]
  }))
}

// ---------------------------------------------------------------------------
// โภชนาการ
// ---------------------------------------------------------------------------
export function dailyNutrition(db: Db, from?: string, to?: string): DailyNutrition[] {
  const targets = db.rows('nutrition_targets')
  const water = db.rows('water_log')
  const logs = db.rows('food_log').filter((f) => (!from || f.date >= from) && (!to || f.date <= to))
  return [...groupBy(logs, (f) => f.date).entries()].map(([date, l]) => {
    const kcal = sum(l.map((f) => f.calories)), protein = sum(l.map((f) => f.protein_g))
    const dayType = todayPlan(db, date).day_type
    const t = targets.find((x) => x.day_type === dayType)
    const fiber = l.some((f) => f.fiber_g != null) ? sum(l.map((f) => f.fiber_g)) : null
    const sodium = l.some((f) => f.sodium_mg != null) ? sum(l.map((f) => f.sodium_mg)) : null
    return {
      user_id: UID, date, kcal, protein_g: protein, carb_g: sum(l.map((f) => f.carb_g)), fat_g: sum(l.map((f) => f.fat_g)),
      fiber_g: fiber, sodium_mg: sodium, items: l.length, day_type: dayType,
      target_kcal: t?.kcal ?? null, target_protein_g: t?.protein_g ?? null, target_carb_g: t?.carb_g ?? null, target_fat_g: t?.fat_g ?? null,
      protein_hit: t ? protein >= t.protein_g : null,
      kcal_in_range: t ? kcal >= t.kcal * 0.9 && kcal <= t.kcal * 1.1 : null,
      water_ml: sum(water.filter((w) => w.date === date).map((w) => w.ml)),
    }
  }).sort(byAsc((d) => d.date))
}

export function foodUsage(db: Db): FoodUsage[] {
  const logs = db.rows('food_log').filter((f) => f.food_id || f.recipe_id)
  return [...groupBy(logs, (f) => `${f.food_id ?? ''}|${f.recipe_id ?? ''}`).values()].map((l) => ({
    user_id: UID, food_id: l[0].food_id, recipe_id: l[0].recipe_id, uses: l.length,
    last_used: l.map((f) => f.date).sort().at(-1)!, last_at: l.map((f) => f.created_at).sort().at(-1)!,
  }))
}

// ---------------------------------------------------------------------------
// สรุปรายสัปดาห์ / กิจกรรมรายวัน
// ---------------------------------------------------------------------------
export function weeklySummary(db: Db): WeeklySummary[] {
  const ws = groupBy(db.rows('weight_sessions'), (s) => weekStart(s.date))
  const runs = db.rows('runs')
  const rn = groupBy(runs, (r) => weekStart(r.date))
  const bw = groupBy(db.rows('body_weight'), (b) => weekStart(b.date))
  const nu = groupBy(dailyNutrition(db), (n) => weekStart(n.date))
  const ck = groupBy(db.rows('daily_checkin'), (c) => weekStart(c.date))
  const weeks = [...new Set([...ws.keys(), ...rn.keys(), ...bw.keys(), ...nu.keys(), ...ck.keys()])].sort()
  const activeDates = new Set([...db.rows('weight_sessions').map((s) => s.date), ...runs.filter(done).map((r) => r.date)])
  const out: WeeklySummary[] = []
  weeks.forEach((w, i) => {
    const r = (rn.get(w) ?? []).filter(done)
    const b = bw.get(w), n = nu.get(w), c = ck.get(w)
    const prev = out[i - 1]
    const avgW = b ? round(avg(b.map((x) => x.weight_kg)), 2) : null
    const km = rn.has(w) ? sum(r.map((x) => x.distance_km)) : null
    out.push({
      user_id: UID, week_start: w, week_end: addDays(w, 6),
      weight_sessions: ws.get(w)?.length ?? 0, runs: r.length, run_km: km ?? 0, run_sec: sum(r.map((x) => x.duration_sec)),
      active_days: [...activeDates].filter((d) => d >= w && d <= addDays(w, 6)).length,
      avg_weight_kg: avgW, weigh_ins: b?.length ?? null,
      weight_change_kg: avgW != null && prev?.avg_weight_kg != null ? round(avgW - prev.avg_weight_kg, 2) : null,
      run_km_change: km != null && prev && rn.has(prev.week_start) ? round(km - prev.run_km, 2) : null,
      avg_kcal: n ? round(avg(n.map((x) => x.kcal))) : null, avg_protein_g: n ? round(avg(n.map((x) => x.protein_g))) : null,
      avg_carb_g: n ? round(avg(n.map((x) => x.carb_g))) : null, avg_fat_g: n ? round(avg(n.map((x) => x.fat_g))) : null,
      food_days: n?.length ?? null, protein_days_hit: n ? n.filter((x) => x.protein_hit).length : null,
      kcal_days_in_range: n ? n.filter((x) => x.kcal_in_range).length : null,
      avg_sleep_hours: c ? round(avg(c.map((x) => x.sleep_hours)), 1) : null, avg_resting_hr: c ? round(avg(c.map((x) => x.resting_hr))) : null,
    })
  })
  return out
}

export function dayActivity(db: Db, from: string, to: string): DayActivity[] {
  const out: DayActivity[] = []
  const sessions = new Set(db.rows('weight_sessions').map((s) => s.date))
  const runs = groupBy(db.rows('runs').filter(done), (r) => r.date)
  const marks = new Map(db.rows('day_marks').map((m) => [m.date, m.status]))
  for (let d = from, i = 0; d <= to && i <= 400; d = addDays(d, 1), i++) {
    const p = todayPlan(db, d)
    const r = runs.get(d)
    out.push({ date: d, planned: p.activity, planned_workout: p.workout_type, weight_done: sessions.has(d), run_done: Boolean(r),
      run_km: r ? sum(r.map((x) => x.distance_km)) : null, mark: marks.get(d) ?? null })
  }
  return out
}

// ---------------------------------------------------------------------------
// เป้าหมาย
// ---------------------------------------------------------------------------
const COMP = ['pbf_pct', 'smm_kg', 'waist_cm', 'body_fat_kg', 'visceral_fat'] as const

export function metricCurrent(db: Db, metric: string, date: string): number | null {
  const [key, arg] = metric.split(':')
  const ws = weekStart(date)
  let v: number | null = null
  if (key === 'weight_kg') {
    const bw = db.rows('body_weight')
    v = avg(bw.filter((b) => b.date >= addDays(date, -6) && b.date <= date).map((b) => b.weight_kg))
    if (v == null) v = num(bw.filter((b) => b.date <= date).sort(byDesc((b) => b.date))[0]?.weight_kg)
  } else if ((COMP as readonly string[]).includes(key)) {
    const k = key as (typeof COMP)[number]
    v = num(db.rows('body_comp').filter((c) => c.date <= date && c[k] != null).sort(byDesc((c) => c.date))[0]?.[k])
  } else if (key === 'active_days_week') {
    v = new Set([
      ...db.rows('weight_sessions').filter((s) => s.date >= ws && s.date <= date).map((s) => s.date),
      ...db.rows('runs').filter((r) => done(r) && r.date >= ws && r.date <= date).map((r) => r.date),
    ]).size
  } else if (key === 'pain_avg7') {
    v = avg(db.rows('pain_log').filter((p) => p.body_part === arg && p.date >= addDays(date, -6) && p.date <= date).map((p) => p.score))
  } else if (key === 'e1rm') {
    v = max(exerciseProgress(db, arg).filter((e) => e.date >= addDays(date, -29) && e.date <= date).map((e) => e.e1rm_lb))
  } else if (key === 'run_distance_week') {
    v = sum(db.rows('runs').filter((r) => done(r) && r.date >= ws && r.date <= date).map((r) => r.distance_km))
  } else if (key === 'run_pace') {
    v = avg(db.rows('runs').filter((r) => r.run_type === arg && r.pace_sec_per_km != null && r.date <= date)
      .sort(byDesc((r) => r.date)).slice(0, 3).map((r) => r.pace_sec_per_km))
  }
  return round(v, 2)
}

function slope(points: { x: number; y: number }[]) {
  return linearRegression(points)?.slope ?? null
}

export function metricSlope(db: Db, metric: string, date: string): number | null {
  const [key, arg] = metric.split(':')
  if (key === 'weight_kg') {
    const l = db.rows('body_weight').filter((b) => b.date >= addDays(date, -27) && b.date <= date)
    if (l.length < 4) return null
    const ds = l.map((b) => b.date).sort()
    if (daysBetween(ds[0], ds.at(-1)!) < 7) return null
    return slope(l.map((b) => ({ x: daysBetween(date, b.date), y: Number(b.weight_kg) })))
  }
  if (['pbf_pct', 'smm_kg', 'waist_cm', 'body_fat_kg'].includes(key)) {
    const k = key as 'pbf_pct'
    const l = db.rows('body_comp').filter((c) => c[k] != null && c.date >= addDays(date, -90) && c.date <= date)
    if (l.length < 2) return null
    const ds = l.map((c) => c.date).sort()
    if (daysBetween(ds[0], ds.at(-1)!) < 7) return null
    return slope(l.map((c) => ({ x: daysBetween(date, c.date), y: Number(c[k]) })))
  }
  if (key === 'pain_avg7') {
    const l = db.rows('pain_log').filter((p) => p.body_part === arg && p.date >= addDays(date, -27) && p.date <= date)
    return l.length >= 4 ? slope(l.map((p) => ({ x: daysBetween(date, p.date), y: p.score }))) : null
  }
  return null
}

export function goalProgress(db: Db, date: string): GoalProgressRow[] {
  return db.rows('goals').filter((g) => g.status !== 'archived')
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((g) => {
      const current = metricCurrent(db, g.metric, date)
      const sl = metricSlope(db, g.metric, date)
      const start = num(g.start_value) ?? current
      const target = Number(g.target_value)
      const keep = g.direction === 'keep_above' || g.direction === 'keep_below'
      const progress = current == null ? null
        : g.direction === 'keep_above' ? (current >= target ? 100 : 0)
        : g.direction === 'keep_below' ? (current <= target ? 100 : 0)
        : start === target ? 100
        : Math.max(0, Math.min(100, round(((start! - current) / (start! - target)) * 100, 1)!))
      const expected = !keep && g.target_date && g.target_date > g.start_date && start != null
        ? round(start + (target - start) * Math.min(1, Math.max(0, daysBetween(g.start_date, date) / daysBetween(g.start_date, g.target_date))), 2)
        : null
      let forecast: string | null = null
      if (current != null && sl) {
        const d = (target - current) / sl
        if (d >= 0 && d <= 3650) forecast = addDays(date, Math.ceil(d))
      }
      const state: GoalProgressRow['state'] = current == null ? 'no_data'
        : g.status === 'done' ? 'done'
        : g.direction === 'down' && current <= target ? 'done'
        : g.direction === 'up' && current >= target ? 'done'
        : g.direction === 'keep_above' ? (current >= target ? 'on_track' : 'behind')
        : g.direction === 'keep_below' ? (current <= target ? 'on_track' : 'behind')
        : expected != null ? ((g.direction === 'down' && current <= expected + 0.1) || (g.direction === 'up' && current >= expected - 0.1) ? 'on_track' : 'behind')
        : sl != null ? ((g.direction === 'down' && sl < 0) || (g.direction === 'up' && sl > 0) ? 'on_track' : 'behind')
        : 'on_track'
      return {
        goal_id: g.id, goal_type: g.goal_type, title: g.title, metric: g.metric, direction: g.direction, start_value: start, start_date: g.start_date,
        target_value: target, target_date: g.target_date, status: g.status, current_value: current, progress_pct: progress, expected_value: expected,
        slope_per_day: sl, forecast_date: forecast, days_left: g.target_date ? daysBetween(date, g.target_date) : null,
        remaining: current != null ? round(target - current, 2) : null, state,
      }
    })
}

// ---------------------------------------------------------------------------
// พัฒนาการเทียบวันอ้างอิง (ref = null → ครั้งแรก)
// ---------------------------------------------------------------------------
export function progressCompare(db: Db, ref: string | null, today: string): ProgressCompare {
  const maxHr = Number(db.rows('settings')[0]?.max_hr ?? 186)
  const bw = db.rows('body_weight')
  const firstBw = bw.map((b) => b.date).sort()[0]
  const bwEnd = ref ?? (firstBw ? addDays(firstBw, 6) : null)
  let wRef = bwEnd ? round(avg(bw.filter((b) => b.date >= addDays(bwEnd, -6) && b.date <= bwEnd).map((b) => b.weight_kg)), 2) : null
  if (wRef == null) wRef = num(bw.filter((b) => b.date <= (bwEnd ?? today)).sort(byDesc((b) => b.date))[0]?.weight_kg)
  const comp = db.rows('body_comp')
  const compRef = (k: 'pbf_pct' | 'smm_kg' | 'waist_cm' | 'body_fat_kg') => {
    const has = comp.filter((c) => c[k] != null)
    const first = [...has].sort(byAsc((c) => c.date))[0]
    if (!ref) return num(first?.[k])
    return num(has.filter((c) => c.date <= ref).sort(byDesc((c) => c.date))[0]?.[k]) ?? num(first?.[k])
  }
  const body = {
    weight_kg: { current: metricCurrent(db, 'weight_kg', today), ref: wRef, good: 'down' as const },
    pbf_pct: { current: metricCurrent(db, 'pbf_pct', today), ref: compRef('pbf_pct'), good: 'down' as const },
    smm_kg: { current: metricCurrent(db, 'smm_kg', today), ref: compRef('smm_kg'), good: 'up' as const },
    waist_cm: { current: metricCurrent(db, 'waist_cm', today), ref: compRef('waist_cm'), good: 'down' as const },
    body_fat_kg: { current: metricCurrent(db, 'body_fat_kg', today), ref: compRef('body_fat_kg'), good: 'down' as const },
  }

  const prog = exerciseProgress(db)
  const exercises = db.rows('exercises').flatMap((e) => {
    const l = prog.filter((p) => p.exercise_id === e.id)
    if (!l.length) return []
    const first = l.map((p) => p.date).sort()[0]
    const current = max(l.filter((p) => p.date >= addDays(today, -27) && p.date <= today).map((p) => p.e1rm_lb))
    const r = max(l.filter((p) => p.date >= addDays(ref ?? first, -27) && p.date <= (ref ?? addDays(first, 27))).map((p) => p.e1rm_lb))
    return current == null && r == null ? [] : [{ name: e.name, exercise_id: e.id, current, ref: r }]
  }).sort((a, b) => a.name.localeCompare(b.name))
  const wt = weeklyTraining(db)
  const wtEnd = ref ?? (wt[0] ? addDays(wt[0].week_start, 27) : today)
  const lifts = {
    exercises,
    weekly_volume: {
      current: wt.length ? round(sum(wt.filter((w) => w.week_start > addDays(today, -28)).map((w) => w.volume_lb)) / 4) : null,
      ref: wt.length ? round(sum(wt.filter((w) => w.week_start >= addDays(wtEnd, -27) && w.week_start <= wtEnd).map((w) => w.volume_lb)) / 4) : null,
    },
  }

  const runs = db.rows('runs').filter(done)
  const firstRun = runs.map((r) => r.date).sort()[0]
  const rEnd = ref ?? (firstRun ? addDays(firstRun, 27) : today)
  const inWin = (d: string, end: string) => d >= addDays(end, -27) && d <= end
  const z2 = (r: { avg_hr: number | null }) => r.avg_hr != null && r.avg_hr >= maxHr * 0.6 && r.avg_hr <= maxHr * 0.7
  const runsOut = {
    easy_pace: { current: round(avg(runs.filter((r) => r.run_type === 'easy' && inWin(r.date, today)).map((r) => r.pace_sec_per_km))),
      ref: round(avg(runs.filter((r) => r.run_type === 'easy' && inWin(r.date, rEnd)).map((r) => r.pace_sec_per_km))), good: 'down' as const },
    z2_pace: { current: round(avg(runs.filter((r) => z2(r) && inWin(r.date, today)).map((r) => r.pace_sec_per_km))),
      ref: round(avg(runs.filter((r) => z2(r) && inWin(r.date, rEnd)).map((r) => r.pace_sec_per_km))),
      hr_min: Math.round(maxHr * 0.6), hr_max: Math.round(maxHr * 0.7), good: 'down' as const },
    weekly_km: { current: round(sum(runs.filter((r) => inWin(r.date, today)).map((r) => r.distance_km)) / 4, 1),
      ref: firstRun || ref ? round(sum(runs.filter((r) => inWin(r.date, rEnd)).map((r) => r.distance_km)) / 4, 1) : null, good: 'up' as const },
  }

  const ck = db.rows('daily_checkin')
  const firstCk = ck.map((c) => c.date).sort()[0]
  const cEnd = ref ?? (firstCk ? addDays(firstCk, 6) : today)
  const in7 = (d: string, end: string) => d >= addDays(end, -6) && d <= end
  const recovery = {
    resting_hr: { current: round(avg(ck.filter((c) => in7(c.date, today)).map((c) => c.resting_hr)), 1),
      ref: round(avg(ck.filter((c) => in7(c.date, cEnd)).map((c) => c.resting_hr)), 1), good: 'down' as const },
    sleep_hours: { current: round(avg(ck.filter((c) => in7(c.date, today)).map((c) => c.sleep_hours)), 1),
      ref: round(avg(ck.filter((c) => in7(c.date, cEnd)).map((c) => c.sleep_hours)), 1), good: 'up' as const },
  }

  const pl = db.rows('pain_log').filter((p) => p.date >= addDays(today, -13) && p.date <= today)
  const pain = [...groupBy(pl, (p) => p.body_part).entries()].map(([part, l]) => ({
    part,
    current: round(avg(l.filter((p) => p.date >= addDays(today, -6)).map((p) => p.score)), 1),
    ref: round(avg(l.filter((p) => p.date <= addDays(today, -7)).map((p) => p.score)), 1),
    good: 'down' as const,
  })).sort((a, b) => a.part.localeCompare(b.part))

  return { ref_date: ref, body, lifts, runs: runsOut, recovery, pain }
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export function achievements(db: Db, today: string): Achievement[] {
  const n = db.rows('weight_sessions').length + db.rows('runs').filter(done).length
  const km = round(sum(db.rows('runs').filter(done).map((r) => r.distance_km)), 1) ?? 0
  let best = 0, cur = 0, prev: string | null = null
  for (const w of weeklySummary(db).filter((x) => x.active_days >= 5).map((x) => x.week_start)) {
    cur = prev && daysBetween(prev, w) === 7 ? cur + 1 : 1
    best = Math.max(best, cur)
    prev = w
  }
  const weightDone = db.rows('goals').some((g) => g.metric === 'weight_kg' && g.status === 'done')
    || goalProgress(db, today).some((g) => g.metric === 'weight_kg' && g.state === 'done')
  const plans = new Map(db.rows('run_plans').map((p) => [p.id, p]))
  const plansDone = db.rows('plan_enrollments').filter((e) => {
    const p = plans.get(e.plan_id)
    const at = e.status === 'done' ? e.updated_at.slice(0, 10) : today
    return p && daysBetween(e.start_date, at) + 1 - e.day_offset >= p.total_days
  }).length
  return [
    { key: 'sessions_10', title: 'ครบ 10 session', icon: '🥉', value: n, target: 10 },
    { key: 'sessions_50', title: 'ครบ 50 session', icon: '🥈', value: n, target: 50 },
    { key: 'sessions_100', title: 'ครบ 100 session', icon: '🥇', value: n, target: 100 },
    { key: 'km_50', title: 'วิ่งรวม 50 กม.', icon: '👟', value: km, target: 50 },
    { key: 'km_100', title: 'วิ่งรวม 100 กม.', icon: '🏃', value: km, target: 100 },
    { key: 'km_500', title: 'วิ่งรวม 500 กม.', icon: '🚀', value: km, target: 500 },
    { key: 'streak_4', title: 'Streak 4 สัปดาห์', icon: '🔥', value: best, target: 4 },
    { key: 'weight_goal', title: 'ถึงเป้าน้ำหนัก', icon: '🎯', value: weightDone ? 1 : 0, target: 1 },
    { key: 'plan_done', title: 'จบแผนวิ่ง', icon: '🏅', value: plansDone, target: 1 },
  ]
}

// ---------------------------------------------------------------------------
// ตัวเลขสำหรับกฎข้อ 6 / สรุปรายสัปดาห์
// ---------------------------------------------------------------------------
/** จำนวนวันติดกันที่ยาวที่สุด */
function longestStreak(dates: string[]) {
  const ds = [...new Set(dates)].sort()
  let best = 0, cur = 0
  ds.forEach((d, i) => {
    cur = i > 0 && daysBetween(ds[i - 1], d) === 1 ? cur + 1 : 1
    best = Math.max(best, cur)
  })
  return best
}

export function weeklyReviewStats(db: Db, ws: string): WeeklyReviewStats {
  const we = addDays(ws, 6)
  const act = dayActivity(db, ws, we)
  const inW = (d: string, a: string, b: string) => d >= a && d <= b
  const bw = db.rows('body_weight')
  const runs = db.rows('runs').filter(done)
  const ck = db.rows('daily_checkin')
  const rhrBase = avg(ck.filter((c) => inW(c.date, addDays(ws, -28), addDays(ws, -1))).map((c) => c.resting_hr))
  let weeks = 0
  for (let wk = ws; weeks < 52; wk = addDays(wk, -7)) {
    const s = db.rows('weight_sessions').filter((x) => inW(x.date, wk, addDays(wk, 6)))
    if (!s.length || s.some((x) => x.is_deload)) break
    weeks++
  }
  const nut = dailyNutrition(db, ws, we)
  const pl = db.rows('pain_log')
  const parts = [...new Set(pl.filter((p) => inW(p.date, addDays(ws, -7), we)).map((p) => p.body_part))].sort()
  const prog = exerciseProgress(db)
  const stalled = db.rows('exercises').filter((e) => e.active).filter((e) => {
    const l = prog.filter((p) => p.exercise_id === e.id && p.date <= we)
    if (!l.some((p) => inW(p.date, addDays(we, -20), we))) return false
    const ord = [...l].sort(byDesc((p) => p.date, (p) => p.session_id)).map((p) => p.e1rm_lb ?? p.max_seconds ?? p.total_reps)
    if (ord.length < 4) return false
    return (max(ord.slice(0, 3)) ?? 0) <= (max(ord.slice(3)) ?? 0)
  }).map((e) => e.name).sort()
  const shoes = shoeUsage(db)
  const prCount = prEvents(db).filter((p) => inW(p.date, ws, we)).length + runPrEvents(db).filter((p) => inW(p.date, ws, we)).length

  return {
    week_start: ws,
    planned_weight: act.filter((d) => d.planned === 'weight').length,
    done_weight: act.filter((d) => d.planned === 'weight' && d.weight_done).length,
    planned_run: act.filter((d) => d.planned === 'run').length,
    done_run: act.filter((d) => d.planned === 'run' && d.run_done).length,
    active_days: act.filter((d) => d.weight_done || d.run_done).length,
    skipped_days: act.filter((d) => d.mark === 'skipped').length,
    weight_avg: round(avg(bw.filter((b) => inW(b.date, ws, we)).map((b) => b.weight_kg)), 2),
    weight_prev_avg: round(avg(bw.filter((b) => inW(b.date, addDays(ws, -7), addDays(ws, -1))).map((b) => b.weight_kg)), 2),
    weight_prev2_avg: round(avg(bw.filter((b) => inW(b.date, addDays(ws, -14), addDays(ws, -8))).map((b) => b.weight_kg)), 2),
    run_km: round(sum(runs.filter((r) => inW(r.date, ws, we)).map((r) => r.distance_km)), 1)!,
    run_km_prev: round(sum(runs.filter((r) => inW(r.date, addDays(ws, -7), addDays(ws, -1))).map((r) => r.distance_km)), 1)!,
    resting_hr_avg: round(avg(ck.filter((c) => inW(c.date, ws, we)).map((c) => c.resting_hr)), 1),
    resting_hr_baseline: round(rhrBase, 1),
    sleep_avg: round(avg(ck.filter((c) => inW(c.date, ws, we)).map((c) => c.sleep_hours)), 1),
    training_weeks_no_deload: weeks,
    prs: prCount,
    protein_days_hit: nut.filter((n) => n.protein_hit).length,
    food_days: nut.length,
    low_protein_streak: longestStreak(nut.filter((n) => n.protein_hit === false).map((n) => n.date)),
    high_rhr_streak: rhrBase == null ? 0
      : longestStreak(ck.filter((c) => inW(c.date, addDays(ws, -2), we) && c.resting_hr != null && c.resting_hr >= rhrBase + 5).map((c) => c.date)),
    low_sleep_streak: longestStreak(ck.filter((c) => inW(c.date, addDays(ws, -2), we) && c.sleep_hours != null && c.sleep_hours < 6).map((c) => c.date)),
    pain: parts.map((part) => {
      const last3 = pl.filter((p) => p.body_part === part && p.date <= we).sort(byDesc((p) => p.date, (p) => p.created_at)).slice(0, 3)
      return {
        part,
        avg: round(avg(pl.filter((p) => p.body_part === part && inW(p.date, ws, we)).map((p) => p.score)), 1),
        prev_avg: round(avg(pl.filter((p) => p.body_part === part && inW(p.date, addDays(ws, -7), addDays(ws, -1))).map((p) => p.score)), 1),
        last3_high: last3.length === 3 && last3.every((p) => p.score >= 4),
      }
    }),
    stalled_exercises: stalled,
    grip_exercises: db.rows('exercises').filter((e) => e.active && e.grip_intensive).map((e) => e.name).sort(),
    shoes_near_retire: db.rows('shoes').filter((s) => s.active).flatMap((s) => {
      const km = shoes.get(s.id)?.km ?? Number(s.start_km)
      return km >= Number(s.retire_km) * 0.9 ? [{ name: s.name, km, retire_km: Number(s.retire_km) }] : []
    }),
  }
}

// ---------------------------------------------------------------------------
// Adaptive TDEE inputs
// ---------------------------------------------------------------------------
export function tdeeInputs(db: Db, end: string): TdeeInputs {
  const logs = db.rows('food_log')
  const bw = db.rows('body_weight')
  const win = (w: number) => {
    const l = logs.filter((f) => f.date >= addDays(end, -w + 1) && f.date <= end)
    const perDay = [...groupBy(l, (f) => f.date).values()].map((d) => sum(d.map((f) => f.calories)))
    return {
      days_logged: perDay.length,
      avg_kcal: round(avg(perDay)),
      weight_first: round(avg(bw.filter((b) => b.date >= addDays(end, -w + 1) && b.date <= addDays(end, -w + 7)).map((b) => b.weight_kg)), 2),
      weight_last: round(avg(bw.filter((b) => b.date >= addDays(end, -6) && b.date <= end).map((b) => b.weight_kg)), 2),
    }
  }
  const targets = db.rows('nutrition_targets')
  const kcals: number[] = []
  for (let i = 1; i <= 7; i++) {
    const t = targets.find((x) => x.day_type === todayPlan(db, addDays(end, i)).day_type)
    if (t) kcals.push(t.kcal)
  }
  return {
    end, w14: win(14), w28: win(28),
    current_avg_target: kcals.length ? Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length) : null,
    mode: (db.rows('settings')[0]?.nutrition_mode ?? 'cut') as 'cut' | 'maintenance',
    weight_goal_done: db.rows('goals').some((g) => g.metric === 'weight_kg' && g.status === 'done')
      || goalProgress(db, addDays(end, 1)).some((g) => g.metric === 'weight_kg' && g.state === 'done'),
  }
}

// ---------------------------------------------------------------------------
// ข้อมูลสำหรับข้อความแจ้งเตือน
// ---------------------------------------------------------------------------
export function notificationPayload(db: Db, date: string, weekly = false) {
  const lastWs = addDays(weekStart(date), -7)
  const foods = db.rows('food_log').filter((f) => f.date === date)
  const base = {
    date,
    plan: todayPlan(db, date),
    weighed: db.rows('body_weight').some((b) => b.date === date),
    last_weight: num(db.rows('body_weight').filter((b) => b.date < date).sort(byDesc((b) => b.date))[0]?.weight_kg),
    food_items: foods.length,
    kcal: Math.round(sum(foods.map((f) => f.calories))),
    protein_g: Math.round(sum(foods.map((f) => f.protein_g))),
    weight_done: db.rows('weight_sessions').some((s) => s.date === date),
    run_done: db.rows('runs').some((r) => r.date === date && done(r)),
    checkin_done: db.rows('daily_checkin').some((c) => c.date === date),
    goals: goalProgress(db, date).filter((g) => g.status === 'active')
      .map((g) => ({ title: g.title, current: g.current_value, target: g.target_value, pct: g.progress_pct, state: g.state })),
  }
  if (!weekly) return base
  const review = db.rows('weekly_reviews').find((r) => r.week_start === lastWs)
  return {
    ...base,
    week_start: lastWs,
    review: review ? { good: review.good, improve: review.improve } : null,
    stats: weeklyReviewStats(db, lastWs),
    weekly: weeklySummary(db).find((w) => w.week_start === lastWs) ?? null,
  }
}


