// สร้าง gas/Code.gs จาก gas/Code.template.js + src/lib/schema.ts (รัน: npm run gas:build)
import { readFileSync, writeFileSync } from 'node:fs'
import { SCHEMA, UNIQUE } from '../src/lib/schema'

const tpl = readFileSync('gas/Code.template.js', 'utf8')
const out = tpl.replace('__SCHEMA__', JSON.stringify(SCHEMA, null, 1)).replace('__UNIQUE__', JSON.stringify(UNIQUE))
writeFileSync('gas/Code.gs', out)
console.log(`wrote gas/Code.gs (${Object.keys(SCHEMA).length} tables)`)
