import { useEffect, useState } from 'react'
import { useLocal, useSchedule, useSettings } from '@/lib/api'
import { store } from '@/lib/store'
import { updateRows } from '@/lib/offline/queue'
import { addDays, THAI_DOW } from '@/lib/date'
import { rangeWarnings } from '@/lib/validation'
import { Button, Card, ErrorBox, Input, Select, Spinner } from '@/components/ui'
import { confirmWarnings } from '@/components/overlay'
import { FREE_RUN_TEMPLATES } from '@/features/run/runMeta'
import type { Activity, DayType, NutritionTarget } from '@/types/database'

const DAY_TYPE_TH: Record<DayType, string> = { weight: 'วันเวท', run_easy: 'วิ่งเบา', run_hard: 'วิ่งหนัก', rest: 'วันพัก' }
const ACTIVITY_TH: Record<Activity, string> = { weight: 'เวท', run: 'วิ่ง', rest: 'พัก', active_recovery: 'Active recovery' }

interface SchedRow { id: string; day_of_week: number; activity: Activity; run_type: 'easy' | 'interval' | 'long' | null }

export function OnboardingPage() {
  const settings = useSettings()
  const schedule = useSchedule()
  const extra = useLocal(() => ({
    weightGoal: store.rows('goals').find((g) => g.metric === 'weight_kg') ?? null,
    targets: store.rows('nutrition_targets'),
  }))

  const [form, setForm] = useState({
    height_cm: '', birth_date: '', max_hr: '', program_start_date: '', target_weight_kg: '', target_date: '',
  })
  const [sched, setSched] = useState<SchedRow[]>([])
  const [targets, setTargets] = useState<NutritionTarget[]>([])
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const s = settings.data
    const g = extra.data?.weightGoal
    if (!s) return
    setForm({
      height_cm: String(s.height_cm ?? ''),
      birth_date: s.birth_date ?? '',
      max_hr: String(s.max_hr),
      program_start_date: s.program_start_date ?? '',
      target_weight_kg: String(g?.target_value ?? s.target_weight_kg ?? ''),
      target_date: g?.target_date ?? (s.program_start_date ? addDays(s.program_start_date, 56) : ''),
    })
  }, [settings.data, extra.data])
  useEffect(() => {
    if (schedule.data) setSched(schedule.data.map((r) => ({ id: r.id, day_of_week: r.day_of_week, activity: r.activity, run_type: (r.run_type as SchedRow['run_type']) ?? null })))
  }, [schedule.data])
  useEffect(() => {
    if (extra.data) setTargets([...extra.data.targets].sort((a, b) => Object.keys(DAY_TYPE_TH).indexOf(a.day_type) - Object.keys(DAY_TYPE_TH).indexOf(b.day_type)))
  }, [extra.data])

  if (settings.isLoading || schedule.isLoading || extra.isLoading) return <Spinner />
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    setError(null)
    const warnings = [
      ...rangeWarnings({
        height_cm: Number(form.height_cm),
        max_hr: Number(form.max_hr),
        body_weight_kg: Number(form.target_weight_kg),
      }),
      ...targets.flatMap((t) => rangeWarnings({ kcal: t.kcal })),
    ]
    if (!(await confirmWarnings(warnings))) return
    setSaving(true)
    try {
      const s = settings.data!
      const g = extra.data?.weightGoal
      if (g) {
        await updateRows('goals', [g.id], {
          target_value: Number(form.target_weight_kg),
          target_date: form.target_date || null,
          start_date: form.program_start_date || g.start_date,
          title: `น้ำหนัก ${Number(form.target_weight_kg).toFixed(1)} กก.`,
        })
      }
      for (const row of sched) {
        const tpl = row.activity === 'run' ? FREE_RUN_TEMPLATES[row.run_type ?? 'easy'] : null
        await updateRows('weekly_schedule', [row.id], {
          activity: row.activity,
          run_type: row.activity === 'run' ? (row.run_type ?? 'easy') : null,
          title: tpl?.title ?? null,
          segments: tpl?.segments ?? [],
        })
      }
      for (const t of targets) {
        await updateRows('nutrition_targets', [t.id], { kcal: t.kcal, protein_g: t.protein_g, carb_g: t.carb_g, fat_g: t.fat_g })
      }
      // ตั้ง onboarded_at ท้ายสุด (หน้าจอจะเปลี่ยนไปหน้าแอปทันที)
      await updateRows('settings', [s.id], {
        height_cm: Number(form.height_cm) || null,
        birth_date: form.birth_date || null,
        max_hr: Number(form.max_hr) || 186,
        program_start_date: form.program_start_date || null,
        target_weight_kg: Number(form.target_weight_kg) || null,
        onboarded_at: new Date().toISOString(),
      })
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  const setTarget = (i: number, k: 'kcal' | 'protein_g' | 'carb_g' | 'fat_g', v: string) =>
    setTargets(targets.map((t, j) => (j === i ? { ...t, [k]: Number(v) || 0 } : t)))

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold">ยินดีต้อนรับ 👋</h1>
        <p className="text-slate-500">ตรวจสอบข้อมูลตั้งต้นด้านล่าง แก้ได้ตามต้องการ แล้วกด "เริ่มใช้งาน"</p>
      </div>

      <Card title="ข้อมูลพื้นฐาน">
        <div className="grid grid-cols-2 gap-3">
          <Input label="ส่วนสูง (ซม.)" inputMode="decimal" value={form.height_cm} onChange={set('height_cm')} />
          <Input label="วันเกิด" type="date" value={form.birth_date} onChange={set('birth_date')} />
          <Input label="MaxHR (bpm)" inputMode="numeric" value={form.max_hr} onChange={set('max_hr')} />
          <Input label="วันเริ่มโปรแกรม" type="date" value={form.program_start_date} onChange={set('program_start_date')} />
        </div>
        <p className="mt-2 text-xs text-slate-500">InBody 25/09/2026: 78.3 กก. · SMM 38.3 · Body fat 11.6 กก. · PBF 14.8% · Visceral 4 (บันทึกไว้แล้ว)</p>
      </Card>

      <Card title="เป้าน้ำหนัก">
        <div className="grid grid-cols-2 gap-3">
          <Input label="น้ำหนักเป้าหมาย (กก.)" inputMode="decimal" value={form.target_weight_kg} onChange={set('target_weight_kg')} />
          <Input label="ภายในวันที่" type="date" value={form.target_date} onChange={set('target_date')} />
        </div>
        <p className="mt-2 text-xs text-slate-500">เป้าอื่นที่ตั้งไว้: PBF 12%, SMM ≥ 38.0 กก., ออกกำลังกาย 6 วัน/สัปดาห์, เจ็บศอกซ้ายเฉลี่ย 7 วัน ≤ 2</p>
      </Card>

      <Card title="ตารางประจำสัปดาห์">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const row = sched.find((r) => r.day_of_week === dow)
            if (!row) return null
            const update = (p: Partial<SchedRow>) => setSched(sched.map((r) => (r.day_of_week === dow ? { ...r, ...p } : r)))
            return (
              <div key={dow} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2">
                <span className="font-medium">{THAI_DOW[dow]}</span>
                <Select value={row.activity} onChange={(e) => update({ activity: e.target.value as Activity })}>
                  {Object.entries(ACTIVITY_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                {row.activity === 'run' ? (
                  <Select value={row.run_type ?? 'easy'} onChange={(e) => update({ run_type: e.target.value as SchedRow['run_type'] })}>
                    <option value="easy">Easy 30-40 นาที</option>
                    <option value="interval">Interval 1/2 × 6</option>
                    <option value="long">Long 45-50 นาที</option>
                  </Select>
                ) : <span />}
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">วันเวทจะวนโปรแกรม A → B อัตโนมัติ · ถ้าเลือกแผนวิ่ง (FASTBULL) แผนจะใช้แทนตารางนี้</p>
      </Card>

      <Card title="เป้าโภชนาการตามประเภทวัน">
        <div className="grid grid-cols-[5rem_repeat(4,1fr)] gap-2 text-sm">
          <span />
          <span className="text-center font-medium">kcal</span>
          <span className="text-center font-medium">P (g)</span>
          <span className="text-center font-medium">C (g)</span>
          <span className="text-center font-medium">F (g)</span>
          {targets.map((t, i) => (
            <div key={t.id} className="contents">
              <span className="self-center font-medium">{DAY_TYPE_TH[t.day_type]}</span>
              {(['kcal', 'protein_g', 'carb_g', 'fat_g'] as const).map((k) => (
                <input
                  key={k}
                  inputMode="numeric"
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white text-center dark:border-slate-700 dark:bg-slate-950"
                  value={t[k]}
                  onChange={(e) => setTarget(i, k, e.target.value)}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>

      <ErrorBox error={error} />
      <Button block size="lg" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'เริ่มใช้งาน'}</Button>
    </div>
  )
}

