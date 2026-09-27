import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk, useShoes } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { fmtDate, todayIso } from '@/lib/date'
import { deleteRows, updateRows, upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Card, Empty, ErrorBox, Input, PageTitle, ProgressBar, Spinner } from '@/components/ui'
import { confirmDialog, Modal } from '@/components/overlay'
import type { Shoe, ShoeUsage } from '@/types/database'

export function useShoeUsage() {
  return useQuery({
    queryKey: ['dash', 'shoe_usage'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shoe_usage').select('*')
      if (error) throw new Error(error.message)
      return new Map((data as ShoeUsage[]).map((u) => [u.shoe_id, u]))
    },
  })
}

/** รองเท้าที่ใช้ไป ≥ 90% ของระยะเปลี่ยน */
export function shoeWarning(shoe: Shoe, km: number) {
  const pct = (km / Number(shoe.retire_km)) * 100
  return { pct, warn: shoe.active && pct >= 90, over: pct >= 100 }
}

export function ShoesPage() {
  const shoes = useShoes()
  const usage = useShoeUsage()
  const [editing, setEditing] = useState<Partial<Shoe> | null>(null)
  if (shoes.isLoading) return <Spinner />
  const list = shoes.data ?? []
  return (
    <div className="space-y-4">
      <PageTitle action={<Button size="sm" onClick={() => setEditing({})}>+ รองเท้า</Button>}>รองเท้าวิ่ง</PageTitle>
      {list.map((s) => {
        const km = Number(usage.data?.get(s.id)?.km ?? s.start_km)
        const w = shoeWarning(s, km)
        return (
          <Card key={s.id} className={s.active ? '' : 'opacity-60'}>
            <button type="button" className="w-full text-left" onClick={() => setEditing(s)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">👟 {s.name}</span>
                {!s.active ? <Badge>ปลดระวางแล้ว</Badge> : w.over ? <Badge color="red">⚠️ ถึงระยะเปลี่ยน</Badge> : w.warn ? <Badge color="amber">⚠️ ใกล้ถึงระยะเปลี่ยน</Badge> : null}
              </div>
              <div className="mt-1 flex justify-between text-sm tabular-nums">
                <span>{km.toLocaleString()} / {Number(s.retire_km)} กม.</span>
                <span className="text-slate-500">{usage.data?.get(s.id)?.runs ?? 0} ครั้ง · เริ่ม {fmtDate(s.start_date)}</span>
              </div>
              <ProgressBar className="mt-1" pct={w.pct} tone={w.warn ? 'amber' : 'blue'} />
            </button>
          </Card>
        )
      })}
      {!list.length && <Empty>ยังไม่มีรองเท้า — เพิ่มเพื่อเลือกตอนบันทึกวิ่งและติดตามระยะ</Empty>}
      {editing && <ShoeForm shoe={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ShoeForm({ shoe, onClose }: { shoe: Partial<Shoe>; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: shoe.name ?? '', start_date: shoe.start_date ?? todayIso(),
    start_km: String(shoe.start_km ?? 0), retire_km: String(shoe.retire_km ?? 700),
  })
  const [error, setError] = useState<unknown>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.shoes }), qc.invalidateQueries({ queryKey: ['dash', 'shoe_usage'] })])
  const save = async () => {
    setError(null)
    try {
      if (!f.name.trim()) throw new Error('กรอกชื่อรองเท้า')
      const row = { name: f.name.trim(), start_date: f.start_date, start_km: Number(f.start_km) || 0, retire_km: Number(f.retire_km) || 700 }
      if (shoe.id) await updateRows('shoes', [shoe.id], row)
      else await upsertRows('shoes', [{ ...row, active: true }])
      await refresh()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  const setActive = async (active: boolean) => {
    await updateRows('shoes', [shoe.id!], { active })
    await refresh()
    onClose()
  }
  const del = async () => {
    if (!(await confirmDialog('ลบรองเท้านี้? (ประวัติวิ่งยังอยู่ แต่จะไม่ผูกกับรองเท้า)', { danger: true, okText: 'ลบ' }))) return
    await deleteRows('shoes', [shoe.id!])
    await refresh()
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open onClose={onClose} title={shoe.id ? 'แก้รองเท้า' : 'รองเท้าใหม่'}
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <div className="space-y-3">
        <Input label="ชื่อ/รุ่น" value={f.name} onChange={set('name')} placeholder="เช่น Pegasus 41" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="เริ่มใช้" type="date" value={f.start_date} onChange={set('start_date')} />
          <Input label="ระยะเดิม (กม.)" inputMode="decimal" value={f.start_km} onChange={set('start_km')} />
          <Input label="ระยะเปลี่ยน (กม.)" inputMode="decimal" value={f.retire_km} onChange={set('retire_km')} />
        </div>
        <ErrorBox error={error} />
        {shoe.id && (
          <div className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button size="sm" variant="secondary" onClick={() => void setActive(!shoe.active)}>{shoe.active ? 'ปลดระวาง' : 'ใช้งานอีกครั้ง'}</Button>
            <Button size="sm" variant="ghost" onClick={() => void del()}>ลบ</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
