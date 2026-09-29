// สำรองข้อมูลทั้งหมดจาก Google Sheet เป็น JSON (GitHub Actions ทุกสัปดาห์ — ห้าม commit ไฟล์ผลลัพธ์ลง repo)
// รัน: npx tsx --tsconfig tsconfig.scripts.json scripts/backup.ts   (env: GAS_URL, GAS_KEY)
import { writeFileSync } from 'node:fs'
import { gas, requireGas } from './lib/gas'

requireGas()
const { tables } = await gas<{ tables: Record<string, unknown[]> }>('pull')
const total = Object.values(tables).reduce((a, r) => a + r.length, 0)
const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const file = `backup-${stamp}.json`
writeFileSync(file, JSON.stringify({ format: 'workout-log/export@1', exported_at: new Date().toISOString(), tables }))
console.log(`wrote ${file}: ${total} rows in ${Object.keys(tables).length} tables`)
