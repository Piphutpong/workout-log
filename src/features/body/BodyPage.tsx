import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, useBodyComp, useBodyWeights, usePainLog, useProgressPhotos, useSettings } from '@/lib/api'
import { addDays, daysBetween, fmtDate, todayIso } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { rangeWarnings } from '@/lib/validation'
import { Badge, Button, Card, Empty, ErrorBox, Input, PageTitle, Segmented, Select, Textarea, cx } from '@/components/ui'
import { confirmWarnings, toast } from '@/components/overlay'
import type { PainLog } from '@/types/database'
import { ANGLE_TH, resizeImage, uploadPhoto, useSignedUrls, type Angle } from './photos'
import { PhotoCompare } from './PhotoCompare'

type Tab = 'comp' | 'photos' | 'pain'

export function BodyPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'comp'
  return (
    <div className="space-y-4">
      <PageTitle>ร่างกาย</PageTitle>
      <Segmented
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[{ value: 'comp', label: 'Body comp' }, { value: 'photos', label: 'รูป' }, { value: 'pain', label: 'อาการเจ็บ' }]}
      />
      {tab === 'comp' && <BodyCompTab />}
      {tab === 'photos' && <PhotosTab />}
      {tab === 'pain' && <PainTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
const COMP_FIELDS = [
  { k: 'weight_kg', label: 'น้ำหนัก (กก.)' },
  { k: 'smm_kg', label: 'SMM (กก.)' },
  { k: 'body_fat_kg', label: 'Body fat (กก.)' },
  { k: 'pbf_pct', label: 'PBF (%)' },
  { k: 'visceral_fat', label: 'Visceral fat' },
  { k: 'waist_cm', label: 'รอบเอว (ซม.)' },
] as const

function BodyCompTab() {
  const qc = useQueryClient()
  const comp = useBodyComp()
  const [date, setDate] = useState(todayIso())
  const [vals, setVals] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const num = (k: string) => (vals[k]?.trim() ? Number(vals[k]) : null)
    if (COMP_FIELDS.every((f) => num(f.k) == null)) return toast('กรอกอย่างน้อย 1 ค่า')
    if (!(await confirmWarnings(rangeWarnings({ body_weight_kg: num('weight_kg') })))) return
    setSaving(true)
    try {
      const row = Object.fromEntries(COMP_FIELDS.map((f) => [f.k, num(f.k)])) as Record<(typeof COMP_FIELDS)[number]['k'], number | null>
      const res = await upsertRows('body_comp', [{ date, ...row, note: note || null }])
      toast(res.queued ? 'บันทึกแล้ว (รอส่ง)' : 'บันทึก Body comp แล้ว')
      setVals({})
      setNote('')
      await invalidateDash(qc)
    } finally {
      setSaving(false)
    }
  }

  const latest = comp.data?.[0]
  return (
    <>
      <Card title="บันทึก InBody / รอบเอว">
        <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {COMP_FIELDS.map((f) => (
            <Input key={f.k} label={f.label} inputMode="decimal" placeholder={latest?.[f.k] != null ? String(latest[f.k]) : ''}
              value={vals[f.k] ?? ''} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />
          ))}
        </div>
        <Textarea className="mt-3" label="โน้ต" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น InBody ที่ฟิตเนส, วัดตอนเช้า" />
        <Button className="mt-3" block onClick={save} disabled={saving}>บันทึก</Button>
      </Card>
      <Card title="ประวัติ">
        {comp.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="text-left text-slate-500"><th className="py-1">วันที่</th><th>น้ำหนัก</th><th>SMM</th><th>BF</th><th>PBF</th><th>เอว</th></tr></thead>
              <tbody>
                {comp.data.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2">{fmtDate(c.date)}</td><td>{c.weight_kg ?? '-'}</td><td>{c.smm_kg ?? '-'}</td>
                    <td>{c.body_fat_kg ?? '-'}</td><td>{c.pbf_pct ?? '-'}</td><td>{c.waist_cm ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>ยังไม่มีข้อมูล</Empty>}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
function PhotosTab() {
  const qc = useQueryClient()
  const photos = useProgressPhotos()
  const weights = useBodyWeights()
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(todayIso())
  const [angle, setAngle] = useState<Angle>('front')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const recent = (photos.data ?? []).slice(0, 12)
  const urls = useSignedUrls(recent.map((p) => p.storage_path))
  const lastDate = photos.data?.[0]?.date
  const since = lastDate ? daysBetween(lastDate, todayIso()) : null

  const onFile = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const blob = await resizeImage(file)
      const path = await uploadPhoto(blob, date, angle)
      const w = weights.data?.find((x) => x.date === date)?.weight_kg ?? null
      await upsertRows('progress_photos', [{ date, angle, storage_path: path, weight_kg: w }])
      toast(`อัปโหลดรูป${ANGLE_TH[angle]}แล้ว (${Math.round(blob.size / 1024)} KB)`)
      await invalidateDash(qc)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="📷 อัปโหลดรูปความก้าวหน้า">
        <p className="mb-3 text-sm text-slate-500">
          แนะนำทุก 2 สัปดาห์ ตอนเช้าก่อนกินอาหาร ที่เดิม แสงเดิม ท่าเดิม
          {since != null && <> · ครั้งล่าสุด {since} วันก่อน{since >= 14 && <Badge color="amber" className="ml-1">ถึงเวลาถ่ายแล้ว</Badge>}</>}
        </p>
        <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Segmented className="mt-3" value={angle} onChange={setAngle} options={(Object.keys(ANGLE_TH) as Angle[]).map((k) => ({ value: k, label: ANGLE_TH[k] }))} />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }} />
        <Button className="mt-3" block size="lg" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'กำลังย่อและอัปโหลด…' : `ถ่าย/เลือกรูป${ANGLE_TH[angle]}`}
        </Button>
        <p className="mt-1 text-xs text-slate-500">ย่อเหลือกว้างไม่เกิน 1080px (JPEG 80%) ก่อนอัปโหลด · เก็บแบบส่วนตัว เห็นได้เฉพาะคุณ</p>
        <div className="mt-2"><ErrorBox error={error} /></div>
      </Card>

      <PhotoCompare />

      <Card title="รูปล่าสุด">
        {recent.length ? (
          <div className="grid grid-cols-3 gap-2">
            {recent.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                {urls.data?.get(p.storage_path)
                  ? <img src={urls.data.get(p.storage_path)} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover" />
                  : <div className="aspect-[3/4]" />}
                <figcaption className="p-1 text-center text-[11px]">{fmtDate(p.date)} · {ANGLE_TH[p.angle]}</figcaption>
              </figure>
            ))}
          </div>
        ) : <Empty>ยังไม่มีรูป</Empty>}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
export const BODY_PARTS = ['ศอกซ้าย', 'ศอกขวา', 'เข่า', 'หลังล่าง', 'ไหล่', 'ข้อเท้า', 'น่อง', 'อื่นๆ']
const SIDED = ['เข่า', 'ไหล่', 'ข้อเท้า', 'น่อง', 'อื่นๆ']
const CONTEXTS = ['ระหว่างเวท', 'ระหว่างวิ่ง', 'ตื่นนอน', 'ทั้งวัน'] as const

function PainTab() {
  const qc = useQueryClient()
  const pain = usePainLog()
  const settings = useSettings()
  const pinned = settings.data?.pinned_pain_parts ?? []
  const [part, setPart] = useState(pinned[0] ?? 'ศอกซ้าย')
  const [other, setOther] = useState('')
  const [side, setSide] = useState<PainLog['side']>(null)
  const [score, setScore] = useState<number | null>(null)
  const [context, setContext] = useState<PainLog['context']>('ทั้งวัน')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')

  const save = async () => {
    if (score == null) return toast('เลือกระดับความเจ็บ')
    const bodyPart = part === 'อื่นๆ' ? (other.trim() || 'อื่นๆ') : part
    const res = await upsertRows('pain_log', [{
      date, body_part: bodyPart, score, context, note: note || null,
      side: part.includes('ซ้าย') ? 'left' : part.includes('ขวา') ? 'right' : side,
      pinned: pinned.includes(bodyPart),
    }])
    toast(res.queued ? 'บันทึกแล้ว (รอส่ง)' : `บันทึกอาการเจ็บ${bodyPart} ${score}/10`)
    setScore(null)
    setNote('')
    await invalidateDash(qc)
  }

  // เฉลี่ย 7 วันต่อจุด เทียบสัปดาห์ก่อน
  const today = todayIso()
  const parts = [...new Set((pain.data ?? []).filter((p) => p.date >= addDays(today, -13)).map((p) => p.body_part))]
  const avg = (bp: string, from: string, to: string) => {
    const l = (pain.data ?? []).filter((p) => p.body_part === bp && p.date >= from && p.date <= to)
    return l.length ? l.reduce((a, p) => a + p.score, 0) / l.length : null
  }

  return (
    <>
      <Card title="🩹 บันทึกอาการเจ็บ">
        <div className="flex flex-wrap gap-2">
          {BODY_PARTS.map((p) => (
            <button key={p} type="button" onClick={() => setPart(p)}
              className={cx('min-h-10 rounded-full px-3 text-sm font-semibold', part === p ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>
              {pinned.includes(p) && '📌 '}{p}
            </button>
          ))}
        </div>
        {part === 'อื่นๆ' && <Input className="mt-2" placeholder="ระบุจุด" value={other} onChange={(e) => setOther(e.target.value)} />}
        {SIDED.includes(part) && (
          <Segmented className="mt-2" value={side ?? 'both'} onChange={(v) => setSide(v === 'both' ? 'both' : v)}
            options={[{ value: 'left', label: 'ซ้าย' }, { value: 'right', label: 'ขวา' }, { value: 'both', label: 'ทั้งสองข้าง' }]} />
        )}
        <div className="mt-3 grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} type="button" onClick={() => setScore(i)}
              className={cx('min-h-11 rounded-lg text-sm font-bold', score === i ? (i >= 4 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 dark:bg-slate-800')}>
              {i}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Select label="ช่วงที่เจ็บ" value={context ?? ''} onChange={(e) => setContext(e.target.value as PainLog['context'])}>
            {CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Textarea className="mt-3" label="โน้ต" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="mt-3" block onClick={save}>บันทึก</Button>
      </Card>

      <Card title="เฉลี่ย 7 วัน">
        {parts.length ? (
          <ul className="space-y-1">
            {parts.map((bp) => {
              const cur = avg(bp, addDays(today, -6), today)
              const prev = avg(bp, addDays(today, -13), addDays(today, -7))
              return (
                <li key={bp} className="flex items-center justify-between">
                  <span>{bp}</span>
                  <span className="tabular-nums">
                    <b className={cx(cur != null && cur > 3 && 'text-red-600')}>{cur?.toFixed(1) ?? '-'}</b>
                    {prev != null && cur != null && (
                      <span className={cx('ml-2 text-sm', cur <= prev ? 'text-emerald-600' : 'text-amber-600')}>
                        {cur <= prev ? '▼' : '▲'} จาก {prev.toFixed(1)}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : <Empty>ไม่มีบันทึก 2 สัปดาห์ล่าสุด</Empty>}
      </Card>

      <Card title="ล่าสุด">
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {(pain.data ?? []).slice(0, 15).map((p) => (
            <li key={p.id} className="flex justify-between py-2">
              <span>{fmtDate(p.date)} · {p.body_part}{p.context ? ` · ${p.context}` : ''}</span>
              <b className={cx(p.score >= 4 && 'text-red-600')}>{p.score}/10</b>
            </li>
          ))}
        </ul>
        {!pain.data?.length && <Empty>ยังไม่มีบันทึก</Empty>}
      </Card>
    </>
  )
}

