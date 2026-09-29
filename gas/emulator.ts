// จำลอง Apps Script + Google Sheet ในหน่วยความจำ (รัน gas/Code.gs จริง) — ใช้ใน test และ `npm run gas:emulator`
import { readFileSync } from 'node:fs'

type Cell = string | number | boolean | Date
export class FakeSheet {
  data: Cell[][] = []
  constructor(public name: string) {}
  getLastRow() { return this.data.length }
  getLastColumn() { return this.data[0]?.length ?? 0 }
  setFrozenRows() {}
  deleteRow(r: number) { this.data.splice(r - 1, 1) }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const sh = this
    return {
      setValues(v: Cell[][]) {
        v.forEach((row, i) => {
          sh.data[r - 1 + i] ??= []
          // Google Sheets ตัด ' นำหน้าข้อความออก (ใช้บังคับให้เป็นข้อความ)
          row.forEach((val, j) => { sh.data[r - 1 + i][c - 1 + j] = typeof val === 'string' && val.startsWith("'") ? val.slice(1) : val })
        })
        return this
      },
      getValues() {
        return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.data[r - 1 + i]?.[c - 1 + j] ?? ''))
      },
      setFontWeight() { return this },
    }
  }
}

export function loadGas(apiKey: string, code = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8')) {
  const sheets = new Map<string, FakeSheet>()
  const props = new Map<string, string>([['API_KEY', apiKey]])
  const mails: { to: string; subject: string }[] = []
  const files = new Map<string, string>()
  const globals = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => { const s = new FakeSheet(n); sheets.set(n, s); return s },
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ text: s }) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    Utilities: {
      formatDate: (d: Date) => d.toISOString().slice(0, 10),
      base64Decode: (s: string) => s,
      base64Encode: (s: string) => s,
      newBlob: (b64: string, mime: string, name: string) => ({ b64, mime, name }),
    },
    MailApp: { sendEmail: (m: { to: string; subject: string }) => mails.push(m), getRemainingDailyQuota: () => 99 },
    DriveApp: {
      getFolderById: () => ({ createFile: (b: { b64: string; mime: string }) => { const id = `file${files.size + 1}`; files.set(id, `data:${b.mime};base64,${b.b64}`); return { getId: () => id } } }),
      createFolder: () => ({ getId: () => 'folder' }),
      getFileById: (id: string) => {
        if (!files.has(id)) throw new Error('not found')
        const [head, b64] = files.get(id)!.split(';base64,')
        return { getBlob: () => ({ getContentType: () => head.slice(5), getBytes: () => b64 }), setTrashed: () => files.delete(id) }
      },
    },
  }
  const fn = new Function(...Object.keys(globals), `${code}\nreturn { doPost, doGet }`)
  const api = fn(...Object.values(globals)) as { doPost: (e: unknown) => { text: string } }
  const post = (body: string) => api.doPost({ postData: { contents: body } }).text
  const call = (body: Record<string, unknown>) => JSON.parse(post(JSON.stringify({ key: apiKey, ...body })))
  return { call, post, sheets, mails, files, raw: api }
}
