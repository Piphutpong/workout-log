// คัดลอก src/lib/rules.ts → supabase/functions/_shared/rules.ts (ให้ Edge Function ใช้กฎชุดเดียวกับแอป)
// รัน: npm run shared:sync  (มี test ตรวจว่าสองไฟล์ตรงกัน)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src', 'lib', 'rules.ts'), 'utf8')
if (/^\s*import\s/m.test(src)) throw new Error('src/lib/rules.ts ต้องไม่มี import')
writeFileSync(join(root, 'supabase', 'functions', '_shared', 'rules.ts'), src)
console.log('synced rules.ts')
