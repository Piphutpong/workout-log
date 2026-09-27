import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dk, invalidateDash, qk, useExercises, usePrograms } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { fmtDuration, fmtPace, parseDuration } from '@/lib/calc'
import { addDays, fmtLongDate, todayIso } from '@/lib/date'
import { deleteRows, updateRows } from '@/lib/offline/queue'
import { Button, Empty, ErrorBox, Input, PageTitle, Select, Spinner, Textarea, cx } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import { RUN_TYPE_TH } from '@/features/run/runMeta'
import { ANGLE_TH, removePhoto, useSignedUrls } from '@/features/body/photos'
import type {
  BodyComp, BodyWeight, DailyCheckin, PainLog, ProgressPhoto, Run, TableName, WeightSession, WeightSet,
} from '@/types/database'

type Kind = 'weight' | 'run' | 'bw' | 'comp' | 'checkin' | 'pain' | 'photo'
const KIND_TH: Record<Kind, string> = {
  weight: '🏋️ เวท', run: '🏃 วิ่ง', bw: '⚖️ น้ำหนัก', comp: '🧬 Body comp', checkin: '🌅 Check-in', pain: '🩹 อาการเจ็บ', photo: '📷 รูป',
}
const TABLE: Record<Kind, TableName> = {
  weight: 'weight_sessions', run: 'runs', bw: 'body_weight', comp: 'body_comp', checkin: 'daily_checkin', pain: 'pain_log', photo: 'progress_photos',
}

interface Item { kind: Kind; id: string; date: string; title: string; sub: string; row: Record<string, unknown> }

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as T
}

function useHistory(days: number) {
  return useQuery({
    queryKey: [...dk.all, 'history', days],
    queryFn: async () => {
      const from = addDays(todayIso(), -days)
      const [ws, sets, runs, bw, comp, ck, pain, photos] = await Promise.all([
        supabase.from('weight_sessions').select('*').gte('date', from),
        supabase.from('weight_sets').select('*').gte('date', from).order('set_no'),
        supabase.from('runs').select('*').gte('date', from),
        supabase.from('body_weight').select('*').gte('date', from),
        supabase.from('body_comp').select('*').gte('date', from),
        supabase.from('daily_checkin').select('*').gte('date', from),
        supabase.from('pain_log').select('*').gte('date', from),
        supabase.from('progress_photos').select('*').gte('date', from),
      ])
      return {
        sessions: must(ws) as WeightSession[], sets: must(sets) as WeightSet[], runs: must(runs) as Run[],
        bw: must(bw) as BodyWeight[], comp: must(comp) as BodyComp[], checkins: must(ck) as DailyCheckin[],
        pain: must(pain) as PainLog[], photos: must(photos) as ProgressPhoto[],
      }
    },
  })
}

export function HistoryPage() {
  const qc = useQueryClient()
  const [days, setDays] = useState(60)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Item | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const h = useHistory(days)
  const programs = usePrograms()
  const exercises = useExercises()
  const progName = (id: string | null) => programs.data?.find((p) => p.id === id)?.name ?? '-'
  const exName = (id: string) => exercises.data?.find((e) => e.id === id)?.name ?? '?'

  const items = useMemo<Item[]>(() => {
    const d = h.data
    if (!d) return []
    const out: Item[] = [
      ...d.sessions.map((s) => {
        const ss = d.sets.filter((x) => x.session_id === s.id)
        return { kind: 'weight' as const, id: s.id, date: s.date, title: `โปรแกรม ${progName(s.program_id)}${s.is_deload ? ' (deload)' : ''}`,
          sub: `${new Set(ss.map((x) => x.exercise_id)).size} ท่า · ${ss.length} เซ็ต${s.duration_min ? ` · ${s.duration_min} นาที` : ''}`, row: s }
      }),
      ...d.runs.map((r) => ({ kind: 'run' as const, id: r.id, date: r.date, title: `${RUN_TYPE_TH[r.run_type]}${r.completed !== 'full' ? (r.completed === 'partial' ? ' ◐' : ' ✗') : ''}`,
        sub: `${r.distance_km ?? '-'} กม. · ${fmtDuration(r.duration_sec)} · ${fmtPace(r.pace_sec_per_km)}/กม.${r.avg_hr ? ` · ${r.avg_hr} bpm` : ''}`, row: r })),
      ...d.bw.map((b) => ({ kind: 'bw' as const, id: b.id, date: b.date, title: `${Number(b.weight_kg)} กก.`, sub: b.note ?? '', row: b })),
      ...d.comp.map((c) => ({ kind: 'comp' as const, id: c.id, date: c.date, title: 'Body comp',
        sub: [c.weight_kg && `${c.weight_kg} กก.`, c.smm_kg && `SMM ${c.smm_kg}`, c.pbf_pct && `PBF ${c.pbf_pct}%`, c.waist_cm && `เอว ${c.waist_cm}`].filter(Boolean).join(' · '), row: c })),
      ...d.checkins.map((c) => ({ kind: 'checkin' as const, id: c.id, date: c.date, title: 'Check-in',
        sub: [c.sleep_hours != null && `นอน ${c.sleep_hours} ชม.`, c.energy && `พลังงาน ${c.energy}/5`, c.soreness && `ล้า ${c.soreness}/5`, c.resting_hr && `RHR ${c.resting_hr}`, c.steps && `${c.steps} ก้าว`].filter(Boolean).join(' · '), row: c })),
      ...d.pain.map((p) => ({ kind: 'pain' as const, id: p.id, date: p.date, title: `${p.body_part} ${p.score}/10`, sub: [p.context, p.note].filter(Boolean).join(' · '), row: p })),
      ...d.photos.map((p) => ({ kind: 'photo' as const, id: p.id, date: p.date, title: `รูป${ANGLE_TH[p.angle]}`, sub: p.note ?? '', row: p })),
    ]
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.data, programs.data])

  const visible = items.filter((i) => !hidden.has(i.id) && (filter === 'all' || i.kind === filter))
  const byDate = new Map<string, Item[]>()
  for (const it of visible) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it])

  /** ลบแบบ undo ได้ 5 วินาที */
  const remove = (it: Item) => {
    setOpen(null)
    setHidden((s) => new Set(s).add(it.id))
    const t = setTimeout(async () => {
      timers.current.delete(it.id)
      try {
        if (it.kind === 'photo') await removePhoto((it.row as ProgressPhoto).storage_path).catch(() => undefined)
        await deleteRows(TABLE[it.kind], [it.id])
        await Promise.all([invalidateDash(qc), qc.invalidateQueries({ queryKey: qk.lastPerf }), qc.invalidateQueries({ queryKey: ['today_plan'] })])
      } catch (e) {
        toast(`ลบไม่สำเร็จ: ${(e as Error).message}`)
        setHidden((s) => { const n = new Set(s); n.delete(it.id); return n })
      }
    }, 5000)
    timers.current.set(it.id, t)
    toast(`ลบ${KIND_TH[it.kind].slice(2)} ${fmtLongDate(it.date)}`, {
      ms: 5000,
      action: {
        label: 'เลิกทำ',
        run: () => {
          clearTimeout(timers.current.get(it.id))
          timers.current.delete(it.id)
          setHidden((s) => { const n = new Set(s); n.delete(it.id); return n })
        },
      },
    })
  }

  return (
    <div className="space-y-4">
      <PageTitle>ประวัติ</PageTitle>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['all', ...Object.keys(KIND_TH)] as (Kind | 'all')[]).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={cx('min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold', filter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>
            {k === 'all' ? 'ทั้งหมด' : KIND_TH[k]}
          </button>
        ))}
      </div>
      {h.isLoading ? <Spinner /> : <ErrorBox error={h.error} />}
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date}>
          <h2 className="mb-1 text-sm font-semibold text-slate-500">{fmtLongDate(date)}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {list.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => setOpen(it)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50 dark:active:bg-slate-800">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{KIND_TH[it.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.title}</span>
                    {it.sub && <span className="block truncate text-sm text-slate-500">{it.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {h.data && !visible.length && <Empty>ไม่มีรายการในช่วง {days} วัน</Empty>}
      {h.data && <Button block variant="secondary" onClick={() => setDays(days + 60)}>โหลดย้อนหลังเพิ่ม 60 วัน</Button>}

      {open && (
        <EditModal
          item={open}
          sets={h.data?.sets.filter((s) => s.session_id === open.id) ?? []}
          exName={exName}
          onClose={() => setOpen(null)}
          onDelete={() => remove(open)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
type Field = { k: string; label: string; type: 'number' | 'text' | 'date' | 'select' | 'duration'; options?: [string, string][] }
const FIELDS: Record<Kind, Field[]> = {
  bw: [{ k: 'date', label: 'วันที่', type: 'date' }, { k: 'weight_kg', label: 'น้ำหนัก (กก.)', type: 'number' }, { k: 'note', label: 'โน้ต', type: 'text' }],
  run: [
    { k: 'date', label: 'วันที่', type: 'date' },
    { k: 'run_type', label: 'ประเภท', type: 'select', options: Object.entries(RUN_TYPE_TH) },
    { k: 'distance_km', label: 'ระยะ (กม.)', type: 'number' },
    { k: 'duration_sec', label: 'เวลา (นาที:วินาที)', type: 'duration' },
    { k: 'avg_hr', label: 'HR เฉลี่ย', type: 'number' },
    { k: 'max_hr', label: 'HR สูงสุด', type: 'number' },
    { k: 'rpe', label: 'RPE', type: 'number' },
    { k: 'completed', label: 'สถานะ', type: 'select', options: [['full', 'ครบ'], ['partial', 'บางส่วน'], ['skipped', 'ข้าม']] },
    { k: 'temp_c', label: 'อุณหภูมิ °C', type: 'number' },
    { k: 'humidity_pct', label: 'ความชื้น %', type: 'number' },
    { k: 'note', label: 'โน้ต', type: 'text' },
  ],
  weight: [{ k: 'date', label: 'วันที่', type: 'date' }, { k: 'duration_min', label: 'เวลา (นาที)', type: 'number' }, { k: 'note', label: 'โน้ต', type: 'text' }],
  comp: [
    { k: 'date', label: 'วันที่', type: 'date' }, { k: 'weight_kg', label: 'น้ำหนัก', type: 'number' }, { k: 'smm_kg', label: 'SMM', type: 'number' },
    { k: 'body_fat_kg', label: 'Body fat (กก.)', type: 'number' }, { k: 'pbf_pct', label: 'PBF %', type: 'number' },
    { k: 'visceral_fat', label: 'Visceral', type: 'number' }, { k: 'waist_cm', label: 'รอบเอว', type: 'number' }, { k: 'note', label: 'โน้ต', type: 'text' },
  ],
  checkin: [
    { k: 'sleep_hours', label: 'นอน (ชม.)', type: 'number' }, { k: 'energy', label: 'พลังงาน 1-5', type: 'number' },
    { k: 'soreness', label: 'ความล้า 1-5', type: 'number' }, { k: 'resting_hr', label: 'Resting HR', type: 'number' },
    { k: 'steps', label: 'ก้าว', type: 'number' }, { k: 'note', label: 'โน้ต', type: 'text' },
  ],
  pain: [
    { k: 'date', label: 'วันที่', type: 'date' }, { k: 'body_part', label: 'จุด', type: 'text' }, { k: 'score', label: 'คะแนน 0-10', type: 'number' },
    { k: 'context', label: 'ช่วง', type: 'select', options: [['ระหว่างเวท', 'ระหว่างเวท'], ['ระหว่างวิ่ง', 'ระหว่างวิ่ง'], ['ตื่นนอน', 'ตื่นนอน'], ['ทั้งวัน', 'ทั้งวัน']] },
    { k: 'note', label: 'โน้ต', type: 'text' },
  ],
  photo: [
    { k: 'angle', label: 'มุม', type: 'select', options: Object.entries(ANGLE_TH) },
    { k: 'weight_kg', label: 'น้ำหนัก', type: 'number' }, { k: 'note', label: 'โน้ต', type: 'text' },
  ],
}

function EditModal({ item, sets, exName, onClose, onDelete }: {
  item: Item
  sets: WeightSet[]
  exName: (id: string) => string
  onClose: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const fields = FIELDS[item.kind]
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => {
    const v = item.row[f.k]
    return [f.k, v == null ? '' : f.type === 'duration' ? fmtDuration(Number(v)) : String(v)]
  })))
  const [setVals_, setSetVals] = useState(() => sets.map((s) => ({ ...s })))
  const [error, setError] = useState<unknown>(null)
  const photoUrl = useSignedUrls(item.kind === 'photo' ? [(item.row as ProgressPhoto).storage_path] : [])

  const save = async () => {
    setError(null)
    try {
      const patch: Record<string, unknown> = {}
      for (const f of fields) {
        const raw = vals[f.k]?.trim() ?? ''
        let v: unknown = raw === '' ? null : raw
        if (f.type === 'number' && raw !== '') {
          if (Number.isNaN(Number(raw))) throw new Error(`${f.label} ต้องเป็นตัวเลข`)
          v = Number(raw)
        }
        if (f.type === 'duration' && raw !== '') {
          v = parseDuration(raw)
          if (v == null) throw new Error('รูปแบบเวลา เช่น 32:10')
        }
        if (v !== (item.row[f.k] ?? null)) patch[f.k] = v
      }
      if (Object.keys(patch).length) await updateRows(TABLE[item.kind], [item.id], patch as never)
      // เซ็ตที่แก้ (เฉพาะเวท)
      for (const s of setVals_) {
        const orig = sets.find((x) => x.id === s.id)
        if (!orig) continue
        const changed = orig.weight_lb !== s.weight_lb || orig.reps !== s.reps || orig.seconds !== s.seconds || (patch.date && orig.date !== patch.date)
        if (changed) await updateRows('weight_sets', [s.id], { weight_lb: s.weight_lb, reps: s.reps, seconds: s.seconds, ...(patch.date ? { date: patch.date as string } : {}) })
      }
      await Promise.all([invalidateDash(qc), qc.invalidateQueries({ queryKey: qk.lastPerf }), qc.invalidateQueries({ queryKey: qk.runs }), qc.invalidateQueries({ queryKey: qk.bodyWeights })])
      toast('บันทึกการแก้ไขแล้ว')
      onClose()
    } catch (e) {
      setError(e)
    }
  }

  const deleteSet = async (id: string) => {
    if (!(await confirmDialog('ลบเซ็ตนี้?'))) return
    await deleteRows('weight_sets', [id])
    setSetVals(setVals_.filter((s) => s.id !== id))
    await invalidateDash(qc)
  }

  const grouped = new Map<string, typeof setVals_>()
  for (const s of setVals_) grouped.set(s.exercise_id, [...(grouped.get(s.exercise_id) ?? []), s])
  // เก็บข้อความที่พิมพ์ไว้ เพื่อให้พิมพ์ทศนิยม (เช่น 12.5) ได้
  const [raw, setRaw] = useState<Record<string, string>>({})
  const updSet = (id: string, k: 'weight_lb' | 'reps' | 'seconds', v: string) => {
    const t = v.replace(',', '.')
    if (t !== '' && !/^\d*\.?\d*$/.test(t)) return
    setRaw({ ...raw, [`${id}:${k}`]: t })
    setSetVals(setVals_.map((s) => (s.id === id ? { ...s, [k]: t === '' || t === '.' ? null : Number(t) } : s)))
  }
  const shown = (id: string, k: 'weight_lb' | 'reps' | 'seconds', v: number | null) => raw[`${id}:${k}`] ?? (v ?? '')

  return (
    <Modal
      open
      onClose={onClose}
      title={`${KIND_TH[item.kind]} · ${fmtLongDate(item.date)}`}
      footer={<>
        <Button variant="danger" onClick={onDelete}>ลบ</Button>
        <Button variant="secondary" block onClick={onClose}>ปิด</Button>
        <Button block onClick={save}>บันทึก</Button>
      </>}
    >
      {item.kind === 'photo' && photoUrl.data && (
        <img src={photoUrl.data.get((item.row as ProgressPhoto).storage_path)} alt="" className="mb-3 max-h-80 w-full rounded-xl object-contain" />
      )}
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => f.type === 'select' ? (
          <Select key={f.k} label={f.label} value={vals[f.k]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })}>
            {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        ) : f.k === 'note' ? (
          <Textarea key={f.k} className="col-span-2" label={f.label} value={vals[f.k]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />
        ) : (
          <Input key={f.k} label={f.label} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined}
            value={vals[f.k]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />
        ))}
      </div>
      {item.kind === 'weight' && (
        <div className="mt-4 space-y-3">
          {[...grouped.entries()].map(([exId, list]) => (
            <div key={exId}>
              <div className="font-semibold">{exName(exId)}</div>
              {list.map((s) => (
                <div key={s.id} className="mt-1 flex items-center gap-2">
                  <span className="w-5 text-sm text-slate-400">{s.set_no}</span>
                  <input className="min-h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center dark:border-slate-700 dark:bg-slate-950" inputMode="decimal"
                    value={shown(s.id, 'weight_lb', s.weight_lb)} placeholder="lb" onChange={(e) => updSet(s.id, 'weight_lb', e.target.value)} />
                  <span className="text-sm text-slate-400">×</span>
                  <input className="min-h-10 w-16 rounded-lg border border-slate-300 bg-white px-2 text-center dark:border-slate-700 dark:bg-slate-950" inputMode="numeric"
                    value={s.seconds != null ? shown(s.id, 'seconds', s.seconds) : shown(s.id, 'reps', s.reps)} placeholder={s.seconds != null ? 'วิ' : 'ครั้ง'}
                    onChange={(e) => updSet(s.id, s.seconds != null ? 'seconds' : 'reps', e.target.value)} />
                  {s.band_level && <span className="text-sm">ยาง{s.band_level}</span>}
                  <button type="button" className="ml-auto p-2 text-slate-400" onClick={() => void deleteSet(s.id)} aria-label="ลบเซ็ต">✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3"><ErrorBox error={error} /></div>
    </Modal>
  )
}
