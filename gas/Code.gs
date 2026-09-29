/**
 * Workout Log — Google Apps Script backend (ฐานข้อมูลคือ Google Sheet ไฟล์นี้)
 * สร้างอัตโนมัติจาก gas/Code.template.js + src/lib/schema.ts ด้วย `npm run gas:build` — แก้ที่ template แทน
 *
 * ติดตั้ง: เปิด Google Sheet → ส่วนขยาย → Apps Script → วางไฟล์นี้ทับ Code.gs
 *   → การตั้งค่าโปรเจกต์ → Script properties: API_KEY = รหัสผ่านยาวๆ (ใช้ล็อกอินแอป)
 *   → ทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป: ดำเนินการในฐานะ "ฉัน", ผู้ที่มีสิทธิ์เข้าถึง "ทุกคน"
 */

const SCHEMA = {
 "settings": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "display_name": "s",
  "sex": "s",
  "height_cm": "n",
  "birth_date": "d",
  "max_hr": "n",
  "target_weight_kg": "n",
  "program_start_date": "d",
  "default_rest_sec": "n",
  "weight_step_lb": "n",
  "pinned_pain_parts": "j",
  "notify_email": "b",
  "notify_morning_time": "s",
  "notify_evening_time": "s",
  "notify_weekly": "b",
  "notify_push": "b",
  "onboarded_at": "s",
  "nutrition_mode": "s",
  "deload_week_start": "d",
  "weather_lat": "n",
  "weather_lon": "n"
 },
 "goals": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "goal_type": "s",
  "title": "s",
  "metric": "s",
  "start_value": "n",
  "start_date": "d",
  "target_value": "n",
  "target_date": "d",
  "direction": "s",
  "status": "s",
  "achieved_at": "s",
  "sort_order": "n"
 },
 "exercises": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "measure_type": "s",
  "muscle_group": "s",
  "grip_intensive": "b",
  "note": "s",
  "active": "b"
 },
 "weight_programs": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "description": "s",
  "color": "s",
  "is_warmup": "b",
  "sort_order": "n",
  "active": "b"
 },
 "program_exercises": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "program_id": "s",
  "exercise_id": "s",
  "sort_order": "n",
  "target_sets": "n",
  "target_reps": "n",
  "target_seconds": "n",
  "target_weight_lb": "n",
  "rest_sec": "n",
  "note": "s",
  "superset_group": "s",
  "target_reps_max": "n"
 },
 "weight_sessions": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "program_id": "s",
  "duration_min": "n",
  "is_deload": "b",
  "note": "s"
 },
 "weight_sets": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "session_id": "s",
  "exercise_id": "s",
  "date": "d",
  "set_no": "n",
  "weight_lb": "n",
  "reps": "n",
  "seconds": "n",
  "band_level": "s",
  "rpe": "n"
 },
 "weekly_schedule": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "day_of_week": "n",
  "activity": "s",
  "run_type": "s",
  "title": "s",
  "segments": "j"
 },
 "weight_rotation": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "sort_order": "n",
  "program_id": "s"
 },
 "warmup_routines": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "activity_type": "s",
  "items": "j"
 },
 "run_plans": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "slug": "s",
  "name": "s",
  "level": "s",
  "goal_distance_km": "n",
  "total_days": "n",
  "source": "s",
  "note": "s",
  "active": "b"
 },
 "run_plan_days": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "plan_id": "s",
  "day_no": "n",
  "week_no": "n",
  "workout_type": "s",
  "title": "s",
  "description": "s",
  "repeat_of_week": "n",
  "add_strides": "b",
  "add_weights": "b",
  "segments": "j",
  "note": "s"
 },
 "plan_enrollments": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "plan_id": "s",
  "start_date": "d",
  "status": "s",
  "day_offset": "n"
 },
 "day_marks": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "status": "s",
  "activity": "s",
  "plan_day_id": "s",
  "note": "s"
 },
 "shoes": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "start_date": "d",
  "start_km": "n",
  "retire_km": "n",
  "active": "b"
 },
 "runs": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "time_of_day": "s",
  "plan_day_id": "s",
  "run_type": "s",
  "distance_km": "n",
  "duration_sec": "n",
  "pace_sec_per_km": "n",
  "avg_hr": "n",
  "max_hr": "n",
  "rpe": "n",
  "feeling": "n",
  "completed": "s",
  "shoe_id": "s",
  "temp_c": "n",
  "humidity_pct": "n",
  "source": "s",
  "external_id": "s",
  "note": "s"
 },
 "run_intervals": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "run_id": "s",
  "rep_no": "n",
  "distance_m": "n",
  "duration_sec": "n",
  "avg_hr": "n"
 },
 "run_splits": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "run_id": "s",
  "km_no": "n",
  "duration_sec": "n",
  "avg_hr": "n",
  "elevation_gain_m": "n"
 },
 "body_weight": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "weight_kg": "n",
  "note": "s"
 },
 "body_comp": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "weight_kg": "n",
  "smm_kg": "n",
  "body_fat_kg": "n",
  "pbf_pct": "n",
  "visceral_fat": "n",
  "waist_cm": "n",
  "note": "s"
 },
 "progress_photos": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "angle": "s",
  "storage_path": "s",
  "weight_kg": "n",
  "note": "s"
 },
 "daily_checkin": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "sleep_hours": "n",
  "energy": "n",
  "soreness": "n",
  "resting_hr": "n",
  "steps": "n",
  "note": "s"
 },
 "pain_log": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "body_part": "s",
  "side": "s",
  "score": "n",
  "context": "s",
  "linked_session_id": "s",
  "linked_run_id": "s",
  "pinned": "b",
  "note": "s"
 },
 "foods": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "name_en": "s",
  "brand": "s",
  "serving_desc": "s",
  "serving_g": "n",
  "calories": "n",
  "protein_g": "n",
  "carb_g": "n",
  "fat_g": "n",
  "fiber_g": "n",
  "sodium_mg": "n",
  "category": "s",
  "source": "s",
  "barcode": "s",
  "is_estimate": "b",
  "is_favorite": "b"
 },
 "recipes": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "servings": "n",
  "note": "s"
 },
 "recipe_items": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "recipe_id": "s",
  "food_id": "s",
  "amount_g": "n"
 },
 "meal_templates": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "items": "j"
 },
 "food_log": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "meal": "s",
  "food_id": "s",
  "recipe_id": "s",
  "name": "s",
  "servings": "n",
  "calories": "n",
  "protein_g": "n",
  "carb_g": "n",
  "fat_g": "n",
  "fiber_g": "n",
  "sodium_mg": "n",
  "time": "s",
  "note": "s"
 },
 "water_log": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "ml": "n"
 },
 "supplements": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "name": "s",
  "dose": "s",
  "timing": "s",
  "active": "b"
 },
 "supplement_log": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "supplement_id": "s",
  "taken": "b"
 },
 "nutrition_targets": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "day_type": "s",
  "kcal": "n",
  "protein_g": "n",
  "carb_g": "n",
  "fat_g": "n"
 },
 "weekly_reviews": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "week_start": "d",
  "good": "j",
  "improve": "j",
  "stats": "j"
 },
 "tdee_proposals": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "week_start": "d",
  "mode": "s",
  "tdee": "n",
  "avg_kcal": "n",
  "weight_change_kg": "n",
  "window_days": "n",
  "days_logged": "n",
  "current_avg_target": "n",
  "proposed_delta": "n",
  "status": "s"
 },
 "push_subscriptions": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "endpoint": "s",
  "p256dh": "s",
  "auth": "s",
  "user_agent": "s"
 },
 "notification_log": {
  "id": "s",
  "user_id": "s",
  "created_at": "s",
  "updated_at": "s",
  "date": "d",
  "kind": "s",
  "channels": "j",
  "title": "s",
  "body": "s"
 }
}
const UNIQUE = {"settings":["user_id"],"body_weight":["date"],"daily_checkin":["date"],"weekly_schedule":["day_of_week"],"nutrition_targets":["day_type"],"supplement_log":["date","supplement_id"],"weekly_reviews":["week_start"],"tdee_proposals":["week_start"],"run_plan_days":["plan_id","day_no"],"exercises":["name"],"push_subscriptions":["endpoint"],"notification_log":["date","kind"]}
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
