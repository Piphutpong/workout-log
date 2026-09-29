/**
 * Workout Log — Google Apps Script backend (ฐานข้อมูลคือ Google Sheet ไฟล์นี้)
 * สร้างอัตโนมัติจาก gas/Code.template.js + src/lib/schema.ts ด้วย `npm run gas:build` — แก้ที่ template แทน
 *
 * ติดตั้ง: เปิด Google Sheet → ส่วนขยาย → Apps Script → วางไฟล์นี้ทับ Code.gs
 *   → การตั้งค่าโปรเจกต์ → Script properties: API_KEY = รหัสผ่านยาวๆ (ใช้ล็อกอินแอป)
 *   → ทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป: ดำเนินการในฐานะ "ฉัน", ผู้ที่มีสิทธิ์เข้าถึง "ทุกคน"
 */

const SCHEMA = __SCHEMA__
const UNIQUE = __UNIQUE__
const PHOTO_FOLDER = 'Workout Log Photos'

function doGet() {
  return json_({ ok: true, app: 'workout-log', hint: 'POST only' })
}

function doPost(e) {
  let req
  try {
    req = JSON.parse(e.postData.contents)
  } catch (err) {
    return json_({ error: 'bad request' })
  }
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY')
  if (!key) return json_({ error: 'ยังไม่ได้ตั้ง API_KEY ใน Script properties' })
  if (req.key !== key) return json_({ error: 'unauthorized' })
  try {
    switch (req.action) {
      case 'ping': return json_({ ok: true, email: Session.getEffectiveUser().getEmail(), time: new Date().toISOString() })
      case 'setup': TABLES_().forEach(sheet_); return json_({ ok: true, tables: TABLES_().length })
      case 'pull': return json_({ tables: pull_(req.tables), time: new Date().toISOString() })
      case 'push': return json_(push_(req.ops || []))
      case 'photo_put': return json_(photoPut_(req))
      case 'photo_get': return json_(photoGet_(req.ids || []))
      case 'photo_delete': return json_(photoDelete_(req.id))
      case 'send_email': return json_(sendEmail_(req))
      default: return json_({ error: 'unknown action: ' + req.action })
    }
  } catch (err) {
    return json_({ error: String((err && err.message) || err) })
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}

function TABLES_() {
  return Object.keys(SCHEMA)
}

/** แท็บของตาราง (สร้างให้ถ้ายังไม่มี และเพิ่มคอลัมน์ที่ขาดต่อท้าย) */
function sheet_(t) {
  if (!SCHEMA[t]) throw new Error('unknown table: ' + t)
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sh = ss.getSheetByName(t)
  const cols = Object.keys(SCHEMA[t])
  if (!sh) {
    sh = ss.insertSheet(t)
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold')
    sh.setFrozenRows(1)
    return sh
  }
  const header = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : []
  const missing = cols.filter((c) => header.indexOf(c) < 0)
  if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold')
  return sh
}

function header_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
}

function fromCell_(v, type) {
  if (v === '' || v === null || v === undefined) return null
  if (type === 'n') return Number(v)
  if (type === 'b') return v === true || v === 'TRUE' || v === 'true'
  if (type === 'j') { try { return JSON.parse(v) } catch (e) { return null } }
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', type === 'd' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss")
  return String(v)
}

/** ข้อความ/วันที่/JSON ใส่ ' นำหน้า เพื่อไม่ให้ Sheets แปลงเป็นวันที่หรือตัวเลขเอง */
function toCell_(v, type) {
  if (v === null || v === undefined || v === '') return ''
  if (type === 'n') return Number(v)
  if (type === 'b') return Boolean(v)
  if (type === 'j') return "'" + JSON.stringify(v)
  return "'" + String(v)
}

function readTable_(t) {
  const sh = sheet_(t)
  const last = sh.getLastRow()
  if (last < 2) return { sh: sh, header: header_(sh), rows: [] }
  const header = header_(sh)
  const values = sh.getRange(2, 1, last - 1, header.length).getValues()
  const types = SCHEMA[t]
  const rows = values.map(function (r) {
    const o = {}
    header.forEach(function (c, i) { if (types[c]) o[c] = fromCell_(r[i], types[c]) })
    return o
  })
  return { sh: sh, header: header, rows: rows }
}

function pull_(tables) {
  const out = {}
  ;(tables && tables.length ? tables : TABLES_()).forEach(function (t) { out[t] = readTable_(t).rows })
  return out
}

function keyOf_(row, cols) {
  return cols.map(function (c) { return String(row[c] === null || row[c] === undefined ? '' : row[c]) }).join('|')
}

/** ops: [{table, op: 'upsert'|'update'|'delete', rows?, ids?, patch?}] ทำตามลำดับภายใต้ lock */
function push_(ops) {
  const lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    const cache = {}
    const load = function (t) { return cache[t] || (cache[t] = readTable_(t)) }
    let changed = 0
    ops.forEach(function (op) {
      const tb = load(op.table)
      const types = SCHEMA[op.table]
      const header = tb.header
      const writeRow = function (idx, obj) {
        const values = header.map(function (c) { return types[c] ? toCell_(obj[c], types[c]) : '' })
        tb.sh.getRange(idx + 2, 1, 1, header.length).setValues([values])
      }
      if (op.op === 'upsert') {
        const uniq = UNIQUE[op.table]
        const appends = []
        ;(op.rows || []).forEach(function (row) {
          let idx = -1
          for (let i = 0; i < tb.rows.length; i++) if (tb.rows[i] && tb.rows[i].id === row.id) { idx = i; break }
          if (idx < 0 && uniq) {
            const k = keyOf_(row, uniq)
            for (let i = 0; i < tb.rows.length; i++) if (tb.rows[i] && keyOf_(tb.rows[i], uniq) === k) { idx = i; break }
          }
          if (idx >= 0) {
            const merged = Object.assign({}, tb.rows[idx], row, { id: tb.rows[idx].id })
            tb.rows[idx] = merged
            writeRow(idx, merged)
          } else {
            tb.rows.push(row)
            appends.push(header.map(function (c) { return types[c] ? toCell_(row[c], types[c]) : '' }))
          }
          changed++
        })
        if (appends.length) tb.sh.getRange(tb.sh.getLastRow() + 1, 1, appends.length, header.length).setValues(appends)
      } else if (op.op === 'update') {
        const ids = op.ids || []
        tb.rows.forEach(function (r, i) {
          if (r && ids.indexOf(r.id) >= 0) {
            const merged = Object.assign({}, r, op.patch || {})
            tb.rows[i] = merged
            writeRow(i, merged)
            changed++
          }
        })
      } else if (op.op === 'delete') {
        const ids = op.ids || []
        const del = []
        tb.rows.forEach(function (r, i) { if (r && ids.indexOf(r.id) >= 0) del.push(i) })
        del.sort(function (a, b) { return b - a }).forEach(function (i) {
          tb.sh.deleteRow(i + 2)
          tb.rows.splice(i, 1)
          changed++
        })
      }
    })
    return { ok: true, changed: changed }
  } finally {
    lock.releaseLock()
  }
}

// ---- รูป (Google Drive โฟลเดอร์ส่วนตัว) ------------------------------------
function folder_() {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('PHOTO_FOLDER_ID')
  if (id) { try { return DriveApp.getFolderById(id) } catch (e) { /* ถูกลบ */ } }
  const f = DriveApp.createFolder(PHOTO_FOLDER)
  props.setProperty('PHOTO_FOLDER_ID', f.getId())
  return f
}

function photoPut_(req) {
  const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mime || 'image/jpeg', req.name || 'photo.jpg')
  const file = folder_().createFile(blob)
  return { id: file.getId() }
}

function photoGet_(ids) {
  const out = {}
  ids.forEach(function (id) {
    try {
      const b = DriveApp.getFileById(id).getBlob()
      out[id] = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes())
    } catch (e) { out[id] = null }
  })
  return { photos: out }
}

function photoDelete_(id) {
  try { DriveApp.getFileById(id).setTrashed(true) } catch (e) { /* ไม่มีแล้ว */ }
  return { ok: true }
}

// ---- อีเมล (ส่งถึงเจ้าของสคริปต์เท่านั้น) -----------------------------------
function sendEmail_(req) {
  const to = Session.getEffectiveUser().getEmail()
  MailApp.sendEmail({ to: to, subject: req.subject || 'Workout Log', htmlBody: req.html || '', body: req.text || '', name: 'Workout Log' })
  return { ok: true, to: to, remaining: MailApp.getRemainingDailyQuota() }
}
