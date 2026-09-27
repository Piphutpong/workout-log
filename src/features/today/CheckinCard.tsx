import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, useCheckins } from '@/lib/api'
import { todayIso } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { rangeWarnings } from '@/lib/validation'
import { Button, Card, Input, Stepper, cx } from '@/components/ui'
import { confirmWarnings, toast } from '@/components/overlay'

const ENERGY = ['😴', '🥱', '😐', '🙂', '⚡']
const SORE = ['😀', '🙂', '😐', '😣', '😖']

function Scale({ label, icons, value, onChange }: { label: string; icons: string[]; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">{label}</div>
      <div className="grid grid-cols-5 gap-1">
        {icons.map((ic, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${label} ${i + 1}`}
            onClick={() => onChange(value === i + 1 ? null : i + 1)}
            className={cx('min-h-11 rounded-lg text-xl', value === i + 1 ? 'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900' : 'bg-slate-100 dark:bg-slate-800')}
          >
            {ic}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CheckinCard() {
  const qc = useQueryClient()
  const today = todayIso()
  const checkins = useCheckins()
  const row = checkins.data?.find((c) => c.date === today)
  const [f, setF] = useState({ sleep_hours: null as number | null, energy: null as number | null, soreness: null as number | null, resting_hr: '', steps: '' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (row) setF({ sleep_hours: row.sleep_hours, energy: row.energy, soreness: row.soreness, resting_hr: row.resting_hr?.toString() ?? '', steps: row.steps?.toString() ?? '' })
    else if (checkins.data) setF((x) => ({ ...x, sleep_hours: x.sleep_hours ?? 7 }))
  }, [row, checkins.data])

  const save = async () => {
    const rhr = f.resting_hr ? Number(f.resting_hr) : null
    if (!(await confirmWarnings(rangeWarnings({ hr: rhr })))) return
    const res = await upsertRows('daily_checkin', [{
      id: row?.id, date: today, sleep_hours: f.sleep_hours, energy: f.energy, soreness: f.soreness,
      resting_hr: rhr, steps: f.steps ? Number(f.steps) : null,
    }], 'user_id,date')
    toast(res.queued ? 'บันทึกแล้ว (รอส่ง)' : 'บันทึก check-in แล้ว')
    setOpen(false)
    await invalidateDash(qc)
  }

  if (row && !open) {
    return (
      <Card title="🌅 Check-in" action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)}>แก้ไข</Button>}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {row.sleep_hours != null && <span>นอน <b>{row.sleep_hours}</b> ชม.</span>}
          {row.energy != null && <span>พลังงาน {ENERGY[row.energy - 1]}</span>}
          {row.soreness != null && <span>ความล้า {SORE[row.soreness - 1]}</span>}
          {row.resting_hr != null && <span>RHR <b>{row.resting_hr}</b></span>}
          {row.steps != null && <span><b>{row.steps.toLocaleString()}</b> ก้าว</span>}
        </div>
      </Card>
    )
  }

  return (
    <Card title="🌅 Check-in วันนี้">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">นอน (ชม.)</div>
          <Stepper value={f.sleep_hours} onChange={(v) => setF({ ...f, sleep_hours: v })} step={0.5} decimals={1} max={24} />
        </div>
        <Scale label="พลังงาน" icons={ENERGY} value={f.energy} onChange={(v) => setF({ ...f, energy: v })} />
        <Scale label="ความล้า/ปวดเมื่อย" icons={SORE} value={f.soreness} onChange={(v) => setF({ ...f, soreness: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Resting HR" inputMode="numeric" value={f.resting_hr} onChange={(e) => setF({ ...f, resting_hr: e.target.value })} />
          <Input label="ก้าว" inputMode="numeric" value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} />
        </div>
        <Button block onClick={save}>บันทึก check-in</Button>
      </div>
    </Card>
  )
}
