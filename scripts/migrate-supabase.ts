// ย้ายข้อมูลเดิมจาก Supabase → Google Sheet (รันครั้งเดียว)
// env: GAS_URL, GAS_KEY + (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) หรือ MIGRATE_FILE=ไฟล์ backup JSON, FORCE=1 ถ้า Sheet มีข้อมูลอยู่แล้ว
// รัน: npx tsx --tsconfig tsconfig.scripts.json scripts/migrate-supabase.ts
import { OWNER, SCHEMA, TABLES, type SheetTable } from '@/lib/schema'
import { sysDayId, sysPlanId } from '@/lib/engine/db'
import { readFileSync } from 'node:fs'
import { gas, requireGas } from './lib/gas'

requireGas()
const SB_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const FILE = process.env.MIGRATE_FILE?.trim()
if (!FILE && (!SB_URL || !SB_KEY)) throw new Error('ต้องตั้ง SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY หรือ MIGRATE_FILE')
const sbHeaders: Record<string, string> = SB_KEY.startsWith('eyJ') ? { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } : { apikey: SB_KEY }

type Row = Record<string, unknown> & { id: string }

async function sbAll(t: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SB_URL}/rest/v1/${t}?select=*&order=id`, { headers: { ...sbHeaders, Range: `${from}-${from + 999}` } })
    if (res.status === 404) return out // ตารางไม่มีใน Supabase
    if (!res.ok) throw new Error(`${t}: HTTP ${res.status} ${await res.text()}`)
    const page = (await res.json()) as Row[]
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

// 1) Sheet ต้องว่าง
await gas('setup')
const existing = (await gas<{ tables: Record<string, Row[]> }>('pull')).tables
const already = Object.values(existing).reduce((a, r) => a + r.length, 0)
if (already && !process.env.FORCE) throw new Error(`Google Sheet มีข้อมูลอยู่แล้ว ${already} แถว — ตั้ง FORCE=1 ถ้าต้องการนำเข้าซ้ำ (upsert ตาม id)`)

// 2) อ่านทั้งหมดจาก Supabase
const data: Partial<Record<SheetTable, Row[]>> = {}
if (FILE) {
  const f = JSON.parse(readFileSync(FILE, 'utf8')) as { tables: Record<string, Row[]> }
  for (const t of TABLES) data[t] = f.tables[t] ?? []
} else {
  for (const t of TABLES) data[t] = await sbAll(t)
}

// 3) แผนระบบ (user_id = null) ใช้ id คงที่ในแอปแทน แล้วแก้การอ้างอิง
const planMap = new Map<string, string>()
const dayMap = new Map<string, string>()
const slugOf = new Map<string, string>()
for (const p of data.run_plans ?? []) if (p.user_id == null && p.slug) { planMap.set(p.id, sysPlanId(p.slug as string)); slugOf.set(p.id, p.slug as string) }
for (const d of data.run_plan_days ?? []) if (d.user_id == null && slugOf.has(d.plan_id as string)) dayMap.set(d.id, sysDayId(slugOf.get(d.plan_id as string)!, d.day_no as number))
data.run_plans = (data.run_plans ?? []).filter((p) => p.user_id != null)
data.run_plan_days = (data.run_plan_days ?? []).filter((d) => d.user_id != null)
const remap = (rows: Row[] | undefined, col: string, m: Map<string, string>) => rows?.forEach((r) => { if (r[col] && m.has(r[col] as string)) r[col] = m.get(r[col] as string) })
remap(data.plan_enrollments, 'plan_id', planMap)
// ไฟล์ backup ไม่มีแผนระบบ → enrollment ที่อ้างแผนระบบเดิมจับคู่ไม่ได้ ต้องเริ่มแผนใหม่ในแอป
const ownPlans = new Set((data.run_plans ?? []).map((x) => x.id))
const lost = (data.plan_enrollments ?? []).filter((e) => !ownPlans.has(e.plan_id as string) && !String(e.plan_id).startsWith('sys:'))
if (lost.length) console.warn(`⚠️ ข้าม plan_enrollments ${lost.length} แถว (อ้างแผนระบบที่จับคู่ไม่ได้) — เริ่มแผนวิ่งใหม่ในแอป`)
data.plan_enrollments = (data.plan_enrollments ?? []).filter((e) => !lost.includes(e))
remap(data.runs, 'plan_day_id', dayMap)
remap(data.day_marks, 'plan_day_id', dayMap)

// 4) รูป: ดาวน์โหลดจาก Supabase Storage → อัปโหลดไป Google Drive
for (const p of FILE ? [] : data.progress_photos ?? []) {
  const res = await fetch(`${SB_URL}/storage/v1/object/progress-photos/${p.storage_path}`, { headers: sbHeaders })
  if (!res.ok) { console.warn(`รูป ${p.storage_path}: HTTP ${res.status} (ข้าม)`); continue }
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
  const up = await gas<{ id: string }>('photo_put', { base64, mime: res.headers.get('content-type') ?? 'image/jpeg', name: `${p.date}_${p.angle}.jpg` })
  p.storage_path = up.id
}

// 5) เขียนลง Sheet (เฉพาะคอลัมน์ใน schema, user_id = owner)
let total = 0
for (const t of TABLES) {
  const cols = Object.keys(SCHEMA[t])
  const rows = (data[t] ?? []).map((r) => Object.fromEntries(cols.map((c) => [c, c === 'user_id' ? OWNER : r[c] ?? null])))
  for (let i = 0; i < rows.length; i += 300) {
    await gas('push', { ops: [{ table: t, op: 'upsert', rows: rows.slice(i, i + 300) }] })
  }
  if (rows.length) console.log(`${t}: ${rows.length}`)
  total += rows.length
}

// 6) ตรวจจำนวนแถว
const after = (await gas<{ tables: Record<string, Row[]> }>('pull')).tables
const bad = TABLES.filter((t) => (after[t]?.length ?? 0) < (data[t]?.length ?? 0))
console.log(`ย้ายแล้ว ${total} แถว${bad.length ? ` — ไม่ครบ: ${bad.join(', ')}` : ' — ครบทุกตาราง ✓'}`)
if (bad.length) process.exit(1)
