// สร้างไอคอน PWA (PNG) แบบไม่ต้องพึ่งไลบรารี: พื้นน้ำเงินเข้ม + ดัมเบลสีขาว
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// รูปทรงในพิกัด 0..1
const rects = [
  [0.14, 0.34, 0.24, 0.66], // แผ่นน้ำหนักซ้ายนอก
  [0.24, 0.28, 0.34, 0.72], // แผ่นซ้ายใน
  [0.34, 0.46, 0.66, 0.54], // แกน
  [0.66, 0.28, 0.76, 0.72], // แผ่นขวาใน
  [0.76, 0.34, 0.86, 0.66], // แผ่นขวานอก
]
const BG = [15, 23, 42]
const FG = [255, 255, 255]
const ACCENT = [59, 130, 246]

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size
      let c = BG
      if (v > 0.8 && v < 0.84 && u > 0.3 && u < 0.7) c = ACCENT
      if (rects.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1)) c = FG
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(out, 'pwa-192.png'), png(192))
writeFileSync(join(out, 'pwa-512.png'), png(512))
writeFileSync(join(out, 'apple-touch-icon.png'), png(180))
const svgRects = rects.map(([x0, y0, x1, y1]) => `<rect x="${x0 * 100}" y="${y0 * 100}" width="${(x1 - x0) * 100}" height="${(y1 - y0) * 100}" rx="1.5" fill="#fff"/>`).join('')
writeFileSync(join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0f172a"/>${svgRects}<rect x="30" y="80" width="40" height="4" rx="2" fill="#3b82f6"/></svg>\n`)
console.log('icons written to public/')
