// เซิร์ฟเวอร์จำลอง Apps Script สำหรับทดลองในเครื่อง (ไม่ต้องมี Google):
//   npm run gas:emulator   แล้วตั้ง .env: VITE_GAS_URL=http://localhost:8787  รหัสผ่าน: dev-password
import http from 'node:http'
import { loadGas } from './emulator'

const PORT = Number(process.env.PORT ?? 8787)
const KEY = process.env.GAS_KEY ?? 'dev-password'
const gas = loadGas(KEY)

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    res.end(JSON.stringify({ ok: true, emulator: true }))
    return
  }
  let body = ''
  req.on('data', (c) => (body += c)).on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    res.end(gas.post(body))
  })
}).listen(PORT, () => console.log(`Apps Script emulator: http://localhost:${PORT}  (API_KEY = ${KEY})`))
