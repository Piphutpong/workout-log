import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, qk, useBodyWeights } from '@/lib/api'
import { addDays, fmtDate, todayIso } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { rangeWarnings } from '@/lib/validation'
import { Button, Card, Stepper } from '@/components/ui'
import { confirmWarnings, toast } from '@/components/overlay'
import type { BodyWeight } from '@/types/database'

function avg(rows: BodyWeight[], from: string, to: string) {
  const r = rows.filter((w) => w.date >= from && w.date <= to)
  return r.length ? r.reduce((a, w) => a + Number(w.weight_kg), 0) / r.length : null
}

export function BodyWeightCard() {
  const qc = useQueryClient()
  const today = todayIso()
  const { data: rows = [] } = useBodyWeights()
  const todayRow = rows.find((r) => r.date === today)
  const last = rows[0]
  const [value, setValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // เติมค่าเริ่มต้นครั้งเดียว (ไม่งั้นลบช่องให้ว่างแล้วจะถูกเติมกลับทันที)
  const filled = useRef(false)
  useEffect(() => {
    if (filled.current || !(todayRow || last)) return
    filled.current = true
    setValue(Number((todayRow ?? last)!.weight_kg))
  }, [todayRow, last])

  const avg7 = avg(rows, addDays(today, -6), today)
  const avgPrev = avg(rows, addDays(today, -13), addDays(today, -7))

  const save = async () => {
    if (value == null) return
    if (!(await confirmWarnings(rangeWarnings({ body_weight_kg: value })))) return
    setSaving(true)
    try {
      const row = { id: todayRow?.id, date: today, weight_kg: value }
      const res = await upsertRows('body_weight', [row], 'user_id,date')
      qc.setQueryData<BodyWeight[]>(qk.bodyWeights, (old = []) => [
        { ...(todayRow ?? ({} as BodyWeight)), ...row, id: res.ids[0] },
        ...old.filter((r) => r.date !== today),
      ])
      if (!res.queued) void qc.invalidateQueries({ queryKey: qk.bodyWeights })
      void invalidateDash(qc)
      toast(res.queued ? 'บันทึกแล้ว (รอส่งเมื่อออนไลน์)' : `บันทึกน้ำหนัก ${value} กก.`)
    } catch (e) {
      toast(`บันทึกไม่สำเร็จ: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="⚖️ น้ำหนักตัววันนี้"
      action={todayRow && <span className="text-sm font-semibold text-emerald-600">✓ บันทึกแล้ว</span>}
    >
      <div className="flex gap-2">
        <Stepper className="flex-1" value={value} onChange={setValue} step={0.1} decimals={1} min={30} max={250} suffix="กก." />
        <Button onClick={save} disabled={saving || value == null} variant={todayRow ? 'secondary' : 'primary'}>
          {todayRow ? 'แก้ไข' : 'บันทึก'}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-slate-500">
        {avg7 != null && <span>เฉลี่ย 7 วัน <b className="text-slate-800 dark:text-slate-200">{avg7.toFixed(2)}</b> กก.</span>}
        {avg7 != null && avgPrev != null && (
          <span className={avg7 - avgPrev <= 0 ? 'text-emerald-600' : 'text-amber-600'}>
            {avg7 - avgPrev <= 0 ? '▼' : '▲'} {Math.abs(avg7 - avgPrev).toFixed(2)} จากสัปดาห์ก่อน
          </span>
        )}
        {!todayRow && last && <span>ล่าสุด {fmtDate(last.date)}</span>}
      </div>
    </Card>
  )
}
