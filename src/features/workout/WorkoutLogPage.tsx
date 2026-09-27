import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  invalidateDash, qk, useExercises, useLastPerformance, useProgramExercises, usePrograms, useRotation, useSettings, useTodayPlan,
} from '@/lib/api'
import { canProgress, fmtDuration } from '@/lib/calc'
import { fmtLongDate, todayIso } from '@/lib/date'
import { clearDraft, loadDraft, saveDraft } from '@/lib/offline/db'
import { upsertRows, uuid } from '@/lib/offline/queue'
import { rangeWarnings } from '@/lib/validation'
import { unlockAudio } from '@/lib/alerts'
import { Badge, Button, Card, Empty, NumInput, PageTitle, Segmented, Select, Spinner, Stepper, Textarea, cx } from '@/components/ui'
import { confirmDialog, confirmWarnings, toast } from '@/components/overlay'
import type { BandLevel, Exercise, LastPerformance, MeasureType, ProgramExercise, WeightProgram } from '@/types/database'
import { RestTimer } from './RestTimer'
import { fmtLastPerformance, fmtTarget } from './format'

interface SetDraft { key: string; weight_lb: number | null; reps: number | null; seconds: number | null; band_level: BandLevel | null; done: boolean }
interface ExDraft {
  key: string
  exercise_id: string
  warmup: boolean
  target: { sets: number; reps: number | null; reps_max?: number | null; seconds: number | null; weight_lb: number | null; rest_sec: number }
  superset?: string | null
  sets: SetDraft[]
}
interface SessionDraft {
  id: string
  date: string
  program_id: string | null
  started_at: number
  exercises: ExDraft[]
  pain: Record<string, number | null>
  note: string
}

const DRAFT_KEY = 'workout-draft'
const BANDS: BandLevel[] = ['เบา', 'กลาง', 'หนัก']

function buildExercise(
  pe: Pick<ProgramExercise, 'exercise_id' | 'target_sets' | 'target_reps' | 'target_seconds' | 'target_weight_lb' | 'rest_sec'>
    & Partial<Pick<ProgramExercise, 'target_reps_max' | 'superset_group'>>,
  measure: MeasureType,
  last: LastPerformance | undefined,
  warmup: boolean,
  defaultRest: number,
): ExDraft {
  const lastSets = last?.sets ?? []
  const sets: SetDraft[] = Array.from({ length: pe.target_sets }, (_, i) => {
    const ls = lastSets[i] ?? lastSets[lastSets.length - 1]
    return {
      key: uuid(),
      weight_lb: measure === 'band' ? null : (ls?.weight_lb ?? pe.target_weight_lb ?? null),
      reps: measure === 'seconds' ? null : pe.target_reps ?? ls?.reps ?? 10,
      seconds: measure === 'seconds' ? pe.target_seconds ?? ls?.seconds ?? 30 : null,
      band_level: measure === 'band' ? (ls?.band_level ?? 'กลาง') : null,
      done: false,
    }
  })
  return {
    key: uuid(),
    exercise_id: pe.exercise_id,
    warmup,
    target: {
      sets: pe.target_sets,
      reps: pe.target_reps,
      reps_max: pe.target_reps_max ?? null,
      seconds: pe.target_seconds,
      weight_lb: pe.target_weight_lb,
      rest_sec: pe.rest_sec ?? defaultRest,
    },
    superset: pe.superset_group ?? null,
    sets,
  }
}

export function WorkoutLogPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const today = todayIso()
  const settings = useSettings()
  const programs = usePrograms()
  const programExercises = useProgramExercises()
  const exercises = useExercises()
  const lastPerf = useLastPerformance()
  const rotation = useRotation()
  const plan = useTodayPlan(today)

  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [restored, setRestored] = useState(false)
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(0)
  const [restLabel, setRestLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingId, setAddingId] = useState('')
  const initDone = useRef(false)

  const exById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data])
  const mainPrograms = (programs.data ?? []).filter((p) => !p.is_warmup && p.active)
  const warmupPrograms = (programs.data ?? []).filter((p) => p.is_warmup && p.active)
  const step = Number(settings.data?.weight_step_lb ?? 2.5)
  const defaultRest = settings.data?.default_rest_sec ?? 90
  const pinned = settings.data?.pinned_pain_parts ?? []
  const ready = programs.data && programExercises.data && exercises.data && lastPerf.data && settings.data && rotation.data && (plan.data || plan.isError)

  const build = useCallback((programId: string | null): SessionDraft => {
    const pes = programExercises.data ?? []
    const list: ExDraft[] = []
    for (const wp of warmupPrograms) {
      for (const pe of pes.filter((x) => x.program_id === wp.id)) {
        const ex = exById.get(pe.exercise_id)
        if (ex) list.push(buildExercise(pe, ex.measure_type, lastPerf.data?.get(ex.id), true, defaultRest))
      }
    }
    for (const pe of pes.filter((x) => x.program_id === programId)) {
      const ex = exById.get(pe.exercise_id)
      if (ex) list.push(buildExercise(pe, ex.measure_type, lastPerf.data?.get(ex.id), false, defaultRest))
    }
    return {
      id: uuid(),
      date: today,
      program_id: programId,
      started_at: Date.now(),
      exercises: list,
      pain: Object.fromEntries(pinned.map((p) => [p, null])),
      note: '',
    }
  }, [programExercises.data, warmupPrograms, exById, lastPerf.data, defaultRest, pinned, today])

  // เริ่มต้น: กู้ draft ถ้ามี ไม่งั้นสร้างจากโปรแกรม (query ?program → today_plan → rotation แรก)
  useEffect(() => {
    if (!ready || initDone.current) return
    initDone.current = true
    void (async () => {
      const saved = await loadDraft<SessionDraft>(DRAFT_KEY)
      const wanted = params.get('program')
      if (saved && (!wanted || wanted === saved.value.program_id)) {
        setDraft(saved.value)
        setRestored(true)
        return
      }
      const pid = wanted ?? plan.data?.weight_program?.id ?? rotation.data?.[0]?.program_id ?? mainPrograms[0]?.id ?? null
      setDraft(build(pid))
    })()
  }, [ready, params, plan.data, rotation.data, mainPrograms, build])

  // บันทึก draft ทุกครั้งที่แก้ไข
  useEffect(() => {
    if (draft) void saveDraft(DRAFT_KEY, draft)
  }, [draft])

  if (!ready || !draft) return <Spinner />

  const program = programs.data!.find((p) => p.id === draft.program_id)
  const touched = draft.exercises.some((e) => e.sets.some((s) => s.done))

  const switchProgram = async (id: string) => {
    if (id === draft.program_id) return
    if (touched && !(await confirmDialog('เปลี่ยนโปรแกรม? เซ็ตที่ติ๊กไว้จะหายไป'))) return
    setParams({ program: id }, { replace: true })
    setDraft(build(id))
    setRestored(false)
  }

  const restart = async () => {
    if (!(await confirmDialog('ล้าง draft แล้วเริ่มใหม่?', { danger: true, okText: 'เริ่มใหม่' }))) return
    setDraft(build(draft.program_id))
    setRestored(false)
  }

  const updateEx = (key: string, fn: (e: ExDraft) => ExDraft) =>
    setDraft((d) => d && { ...d, exercises: d.exercises.map((e) => (e.key === key ? fn(e) : e)) })

  const updateSet = (exKey: string, setKey: string, patch: Partial<SetDraft>) =>
    updateEx(exKey, (e) => ({ ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }))

  const toggleDone = (ex: ExDraft, s: SetDraft) => {
    unlockAudio()
    updateSet(ex.key, s.key, { done: !s.done })
    if (!s.done && ex.target.rest_sec <= 0) {
      toast('Superset — ไปท่าคู่ต่อได้เลย ↔', { ms: 1500 })
    } else if (!s.done) {
      const rest = ex.target.rest_sec
      setRestTotal(rest)
      setRestLabel(exById.get(ex.exercise_id)?.name ?? '')
      setRestEnd(Date.now() + rest * 1000)
    }
  }

  const addSet = (ex: ExDraft) =>
    updateEx(ex.key, (e) => {
      const last = e.sets[e.sets.length - 1]
      return { ...e, sets: [...e.sets, { ...(last ?? { weight_lb: null, reps: 10, seconds: null, band_level: null }), key: uuid(), done: false }] }
    })

  const removeSet = (ex: ExDraft) => updateEx(ex.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))

  const removeExercise = async (ex: ExDraft) => {
    if (!(await confirmDialog(`ลบท่า ${exById.get(ex.exercise_id)?.name} ออกจากวันนี้?`))) return
    setDraft((d) => d && { ...d, exercises: d.exercises.filter((e) => e.key !== ex.key) })
  }

  const addExercise = (id: string) => {
    const ex = exById.get(id)
    if (!ex) return
    const e = buildExercise(
      { exercise_id: id, target_sets: 3, target_reps: ex.measure_type === 'seconds' ? null : 10, target_seconds: ex.measure_type === 'seconds' ? 30 : null, target_weight_lb: null, rest_sec: defaultRest },
      ex.measure_type, lastPerf.data!.get(id), false, defaultRest,
    )
    setDraft((d) => d && { ...d, exercises: [...d.exercises, e] })
    setAddingId('')
  }

  const bumpAll = (ex: ExDraft) =>
    updateEx(ex.key, (e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, weight_lb: (s.weight_lb ?? 0) + step })) }))

  const save = async () => {
    let chosen = draft.exercises.flatMap((e) => e.sets.filter((s) => s.done).map((s) => ({ e, s })))
    if (!chosen.length) {
      if (!(await confirmDialog('ยังไม่ได้ติ๊กเซ็ตไหนเลย บันทึกทุกเซ็ตตามที่กรอกไว้?'))) return
      chosen = draft.exercises.flatMap((e) => e.sets.map((s) => ({ e, s })))
    }
    const warnings = chosen.flatMap(({ s }) => rangeWarnings({ weight_lb: s.weight_lb, reps: s.reps, seconds: s.seconds }))
    if (!(await confirmWarnings([...new Set(warnings)]))) return
    setSaving(true)
    try {
      const duration = Math.max(1, Math.round((Date.now() - draft.started_at) / 60000))
      const s1 = await upsertRows('weight_sessions', [{
        id: draft.id, date: draft.date, program_id: draft.program_id, duration_min: Math.min(duration, 600), note: draft.note || null,
      }])
      const setNo = new Map<string, number>()
      const rows = chosen.map(({ e, s }) => {
        const no = (setNo.get(e.exercise_id) ?? 0) + 1
        setNo.set(e.exercise_id, no)
        return {
          id: s.key, session_id: draft.id, exercise_id: e.exercise_id, date: draft.date, set_no: no,
          weight_lb: s.weight_lb, reps: s.reps, seconds: s.seconds, band_level: s.band_level,
        }
      })
      const s2 = await upsertRows('weight_sets', rows)
      const pains = Object.entries(draft.pain).filter(([, v]) => v != null)
      if (pains.length) {
        await upsertRows('pain_log', pains.map(([part, score]) => ({
          date: draft.date, body_part: part, score: score!, context: 'ระหว่างเวท' as const,
          side: part.includes('ซ้าย') ? 'left' as const : part.includes('ขวา') ? 'right' as const : null,
          linked_session_id: draft.id, pinned: true,
        })))
      }
      await clearDraft(DRAFT_KEY)
      void qc.invalidateQueries({ queryKey: qk.lastPerf })
      void qc.invalidateQueries({ queryKey: qk.weightSessionsRecent })
      void qc.invalidateQueries({ queryKey: ['today_plan'] })
      void invalidateDash(qc)
      toast(s1.queued || s2.queued ? 'บันทึกแล้ว (รอส่งเมื่อออนไลน์)' : `บันทึก ${rows.length} เซ็ต เรียบร้อย 💪`)
      navigate('/today')
    } catch (e) {
      toast(`บันทึกไม่สำเร็จ: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const available = (exercises.data ?? []).filter((e) => e.active && !draft.exercises.some((d) => d.exercise_id === e.id))
  const warmups = draft.exercises.filter((e) => e.warmup)
  const mains = draft.exercises.filter((e) => !e.warmup)
  const elapsed = Math.round((Date.now() - draft.started_at) / 1000)

  const renderEx = (ex: ExDraft) => {
    const info = exById.get(ex.exercise_id)
    if (!info) return null
    return (
      <ExerciseCard
        key={ex.key}
        ex={ex}
        info={info}
        last={lastPerf.data!.get(ex.exercise_id)}
        step={step}
        partner={ex.superset ? draft.exercises.filter((o) => o.key !== ex.key && o.superset === ex.superset && o.warmup === ex.warmup).map((o) => exById.get(o.exercise_id)?.name).join(', ') : ''}
        onToggle={(s) => toggleDone(ex, s)}
        onSet={(s, p) => updateSet(ex.key, s.key, p)}
        onAddSet={() => addSet(ex)}
        onRemoveSet={() => removeSet(ex)}
        onRemove={() => void removeExercise(ex)}
        onBump={() => bumpAll(ex)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/workout/programs"><Button size="sm" variant="secondary">จัดการโปรแกรม</Button></Link>}>
        บันทึกเวท
      </PageTitle>
      <p className="-mt-3 text-sm text-slate-500">{fmtLongDate(draft.date)} · เริ่มมาแล้ว {fmtDuration(elapsed)}</p>

      {restored && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span>กู้คืน draft ที่ค้างไว้แล้ว</span>
          <Button size="sm" variant="ghost" onClick={restart}>เริ่มใหม่</Button>
        </div>
      )}

      <Segmented
        value={draft.program_id}
        onChange={(v) => void switchProgram(v!)}
        options={mainPrograms.map((p: WeightProgram) => ({
          value: p.id,
          label: <span><span className="mr-1 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.name}</span>,
        }))}
      />
      {program?.description && <p className="-mt-2 text-sm text-slate-500">{program.description}</p>}

      {warmups.length > 0 && (
        <details open className="group">
          <summary className="mb-2 cursor-pointer list-none text-lg font-bold">🔥 Warm-up / Rehab <span className="text-sm font-normal text-slate-500">(แตะเพื่อย่อ)</span></summary>
          <div className="space-y-3">{warmups.map(renderEx)}</div>
        </details>
      )}

      <h2 className="text-lg font-bold">ท่าหลัก</h2>
      {mains.length ? <div className="space-y-3">{mains.map(renderEx)}</div> : <Empty>โปรแกรมนี้ยังไม่มีท่า</Empty>}

      <Card>
        <div className="flex gap-2">
          <Select className="flex-1" value={addingId} onChange={(e) => setAddingId(e.target.value)}>
            <option value="">+ เพิ่มท่านอกโปรแกรม (เฉพาะวันนี้)</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Button disabled={!addingId} onClick={() => addExercise(addingId)}>เพิ่ม</Button>
        </div>
      </Card>

      {pinned.length > 0 && (
        <Card title="🩹 อาการเจ็บ (0-10)">
          {pinned.map((part) => {
            const v = draft.pain[part] ?? null
            return (
              <div key={part} className="mb-2">
                <div className="mb-1 font-medium">{part}</div>
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDraft({ ...draft, pain: { ...draft.pain, [part]: v === i ? null : i } })}
                      className={cx(
                        'min-h-10 rounded-lg text-sm font-bold',
                        v === i ? (i > 3 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 dark:bg-slate-800',
                      )}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                {v != null && v > 3 && (
                  <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
                    ⚠️ เจ็บ{part} {v}/10 — ลดน้ำหนักท่าที่ใช้การบีบจับ หรือเปลี่ยนท่า (เช่น ใช้ strap/ยางยืด) ถ้าเจ็บต่อเนื่องควรพบแพทย์หรือนักกายภาพ
                  </p>
                )}
              </div>
            )
          })}
        </Card>
      )}

      <Textarea label="โน้ต" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />

      <Button block size="lg" variant="success" onClick={save} disabled={saving}>
        {saving ? 'กำลังบันทึก…' : '✓ จบและบันทึก'}
      </Button>

      <RestTimer endAt={restEnd} total={restTotal} label={restLabel} onChange={setRestEnd} />
    </div>
  )
}

function ExerciseCard({ ex, info, last, step, partner, onToggle, onSet, onAddSet, onRemoveSet, onRemove, onBump }: {
  ex: ExDraft
  info: Exercise
  last: LastPerformance | undefined
  step: number
  partner?: string
  onToggle: (s: SetDraft) => void
  onSet: (s: SetDraft, p: Partial<SetDraft>) => void
  onAddSet: () => void
  onRemoveSet: () => void
  onRemove: () => void
  onBump: () => void
}) {
  const lastText = fmtLastPerformance(last, info.measure_type)
  const progress = info.measure_type !== 'band' && canProgress(last?.sets, { sets: ex.target.sets, reps: ex.target.reps_max ?? ex.target.reps, seconds: ex.target.seconds })
  const doneCount = ex.sets.filter((s) => s.done).length
  return (
    <Card className={cx(doneCount === ex.sets.length && ex.sets.length > 0 && 'ring-emerald-400 dark:ring-emerald-700')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{info.name}</h3>
          <p className="text-sm text-slate-500">เป้า {fmtTarget({ target_sets: ex.target.sets, target_reps: ex.target.reps, target_reps_max: ex.target.reps_max ?? null, target_seconds: ex.target.seconds, target_weight_lb: ex.target.weight_lb })} · {ex.target.rest_sec > 0 ? `พัก ${ex.target.rest_sec} วิ` : 'ไม่พัก (ต่อท่าคู่)'}</p>
          {ex.superset && <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">↔ Superset {ex.superset}{partner ? ` คู่กับ ${partner}` : ''}</p>}
        </div>
        <button type="button" onClick={onRemove} className="p-2 text-slate-400" aria-label="ลบท่า">✕</button>
      </div>
      {lastText ? (
        <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">{lastText}</p>
      ) : (
        <p className="mb-2 text-sm text-slate-400">ยังไม่เคยบันทึกท่านี้</p>
      )}
      {progress && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <span>💪 ครั้งก่อนทำครบทุกเซ็ต — เพิ่มน้ำหนักได้</span>
          {info.measure_type === 'reps' && <Button size="sm" variant="success" onClick={onBump}>+{step}lb</Button>}
        </div>
      )}
      <div className="mb-1 flex gap-2 px-1 text-xs text-slate-500">
        <span className="w-6 text-center">เซ็ต</span>
        <span className="flex-1 text-center">{info.measure_type === 'band' ? 'ยางยืด' : 'น้ำหนัก (lb)'}</span>
        <span className="w-16 text-center">{info.measure_type === 'seconds' ? 'วินาที' : 'ครั้ง'}</span>
        <span className="w-10" />
      </div>
      <div className="space-y-2">
        {ex.sets.map((s, i) => (
          <div key={s.key} className={cx('flex items-center gap-2 rounded-xl p-1', s.done && 'bg-emerald-50 dark:bg-emerald-950/40')}>
            <span className="w-6 text-center font-bold text-slate-400">{i + 1}</span>
            {info.measure_type === 'band' ? (
              <div className="flex flex-1 gap-1">
                {BANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onSet(s, { band_level: b })}
                    className={cx('min-h-10 flex-1 rounded-lg text-sm font-semibold', s.band_level === b ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}
                  >
                    {b}
                  </button>
                ))}
              </div>
            ) : (
              <Stepper compact className="flex-1" value={s.weight_lb} onChange={(v) => onSet(s, { weight_lb: v })} step={step} decimals={2} />
            )}
            {info.measure_type === 'seconds' ? (
              <NumInput value={s.seconds} onChange={(v) => onSet(s, { seconds: v })} />
            ) : (
              <NumInput value={s.reps} onChange={(v) => onSet(s, { reps: v })} />
            )}
            <button
              type="button"
              onClick={() => onToggle(s)}
              className={cx('size-10 shrink-0 rounded-xl text-xl font-bold', s.done ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 text-slate-300 dark:border-slate-600')}
              aria-label="ทำเซ็ตนี้แล้ว"
            >
              ✓
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onAddSet}>+ เซ็ต</Button>
        {ex.sets.length > 0 && <Button size="sm" variant="ghost" onClick={onRemoveSet}>− เซ็ต</Button>}
        <span className="ml-auto text-sm text-slate-500">{doneCount}/{ex.sets.length} เซ็ต</span>
        {ex.warmup && <Badge color="green">warm-up</Badge>}
      </div>
    </Card>
  )
}
