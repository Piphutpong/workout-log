import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cleanRow, EXPORT_FORMAT, EXPORT_TABLES, planImport, toCsv, type ExportFile, type ImportPlan } from '@/lib/dataio'
import { todayIso } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { Button, Card, ErrorBox, PageTitle } from '@/components/ui'
import { Modal, toast } from '@/components/overlay'
import type { TableName } from '@/types/database'

type Row = Record<string, unknown>

/** ดึงทุกแถวของตาราง (แบ่งหน้า 1000) — แผนวิ่งเอาเฉพาะของผู้ใช้ ไม่รวมแผนระบบ */
async function fetchAll(table: TableName): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from(table) as any).select('*').order('id').range(from, from + 999)
    if (table === 'run_plans' || table === 'run_plan_days') q = q.not('user_id', 'is', null)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data as Row[]))
    if ((data as Row[]).length < 1000) break
  }
  return out
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function DataPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [plan, setPlan] = useState<ImportPlan[] | null>(null)

  const exportAll = async (kind: 'json' | 'csv') => {
    setError(null)
    setBusy(kind === 'json' ? 'กำลัง export JSON…' : 'กำลัง export CSV…')
    try {
      const tables: ExportFile['tables'] = {}
      for (const t of EXPORT_TABLES) tables[t] = await fetchAll(t)
      const stamp = todayIso()
      if (kind === 'json') {
        const file: ExportFile = { format: EXPORT_FORMAT, exported_at: new Date().toISOString(), tables }
        download(`workout-log-${stamp}.json`, JSON.stringify(file), 'application/json')
      } else {
        const { zipSync, strToU8 } = await import('fflate')
        const files: Record<string, Uint8Array> = {}
        for (const [t, rows] of Object.entries(tables)) if (rows?.length) files[`${t}.csv`] = strToU8(toCsv(rows))
        const zip = zipSync(files)
        download(`workout-log-${stamp}-csv.zip`, zip.slice().buffer as ArrayBuffer, 'application/zip')
      }
      const n = Object.values(tables).reduce((a, r) => a + (r?.length ?? 0), 0)
      toast(`Export ${n.toLocaleString()} แถวแล้ว`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const onImportFile = async (f: File) => {
    setError(null)
    setBusy('กำลังตรวจข้อมูลซ้ำ…')
    try {
      const file = JSON.parse(await f.text()) as ExportFile
      if (file.format !== EXPORT_FORMAT) throw new Error('ไม่ใช่ไฟล์ export ของ Workout Log')
      const existing: Partial<Record<TableName, Row[]>> = {}
      for (const t of EXPORT_TABLES) if (file.tables[t]?.length) existing[t] = await fetchAll(t)
      setPlan(planImport(file, existing))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    if (!plan) return
    setBusy('กำลังนำเข้า…')
    try {
      let n = 0
      for (const p of plan) {
        for (let i = 0; i < p.add.length; i += 500) {
          const chunk = p.add.slice(i, i + 500).map((r) => cleanRow(p.table, r))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await upsertRows(p.table, chunk as any)
          n += chunk.length
        }
      }
      await qc.invalidateQueries()
      toast(`นำเข้า ${n.toLocaleString()} แถวแล้ว`)
      setPlan(null)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const totalAdd = plan?.reduce((a, p) => a + p.add.length, 0) ?? 0

  return (
    <div className="space-y-4">
      <PageTitle>ข้อมูล / สำรอง</PageTitle>
      <Card title="⬇️ Export">
        <p className="mb-3 text-sm text-slate-500">JSON = สำรองไว้กู้คืนภายหลัง · CSV = เปิดใน Excel (ไฟล์ .zip แยกตาราง) · รูปภาพไม่รวมในไฟล์</p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!!busy} onClick={() => void exportAll('json')}>JSON</Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => void exportAll('csv')}>CSV (Excel)</Button>
        </div>
      </Card>
      <Card title="⬆️ Import JSON">
        <p className="mb-3 text-sm text-slate-500">ตรวจข้อมูลซ้ำก่อนนำเข้า: แถวที่มีอยู่แล้ว (id เดิม หรือวันที่เดียวกัน) จะถูกข้าม ไม่เขียนทับ</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImportFile(f)
          e.target.value = ''
        }} />
        <Button block variant="secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>เลือกไฟล์ JSON</Button>
      </Card>
      <Card title="🗄 สำรองอัตโนมัติ">
        <p className="text-sm text-slate-500">GitHub Actions export JSON ทุกสัปดาห์ เก็บเป็น artifact 90 วัน (ไม่ commit ลง repo) — ดูวิธีตั้งค่าใน README</p>
      </Card>
      {busy && <p className="text-center text-sm text-slate-500">{busy}</p>}
      <ErrorBox error={error} />

      {plan && (
        <Modal open onClose={() => setPlan(null)} title="ตรวจข้อมูลก่อนนำเข้า"
          footer={<><Button variant="secondary" block onClick={() => setPlan(null)}>ยกเลิก</Button><Button block disabled={!totalAdd || !!busy} onClick={() => void runImport()}>นำเข้า {totalAdd.toLocaleString()} แถว</Button></>}>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left text-slate-500"><th className="py-1">ตาราง</th><th className="text-right">ในไฟล์</th><th className="text-right">ใหม่</th><th className="text-right">ซ้ำ (ข้าม)</th></tr></thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.table} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{p.table}</td><td className="text-right">{p.total}</td>
                  <td className="text-right font-semibold">{p.add.length}</td><td className="text-right text-slate-500">{p.duplicates}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!totalAdd && <p className="mt-2 text-sm text-emerald-600">ข้อมูลทั้งหมดมีอยู่แล้ว ไม่มีอะไรต้องนำเข้า</p>}
        </Modal>
      )}
    </div>
  )
}
