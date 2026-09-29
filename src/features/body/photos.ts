import { useQuery } from '@tanstack/react-query'
import { call } from '@/lib/backend'

// รูปเก็บในโฟลเดอร์ส่วนตัว "Workout Log Photos" ใน Google Drive ของคุณ (storage_path = Drive file id)
export const ANGLE_TH = { front: 'ด้านหน้า', side: 'ด้านข้าง', back: 'ด้านหลัง' } as const
export type Angle = keyof typeof ANGLE_TH

/** ย่อรูปให้กว้างไม่เกิน maxWidth แล้วแปลงเป็น JPEG (~80%) */
export async function resizeImage(file: File, maxWidth = 1080, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ'))), 'image/jpeg', quality))
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** อัปโหลดไป Google Drive คืน file id */
export async function uploadPhoto(blob: Blob, date: string, angle: Angle): Promise<string> {
  if (!navigator.onLine) throw new Error('อัปโหลดรูปต้องออนไลน์')
  const res = await call<{ id: string }>('photo_put', { base64: await toBase64(blob), mime: 'image/jpeg', name: `${date}_${angle}.jpg` })
  return res.id
}

export async function removePhoto(id: string) {
  await call('photo_delete', { id })
}

/** ดึงรูปจาก Drive เป็น data URL (cache ไว้ 1 ชม.) */
export function useSignedUrls(ids: string[]) {
  const key = [...ids].sort().join('|')
  return useQuery({
    queryKey: ['photos', key],
    enabled: ids.length > 0 && navigator.onLine,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const res = await call<{ photos: Record<string, string | null> }>('photo_get', { ids })
      return new Map<string, string>(Object.entries(res.photos).filter((e): e is [string, string] => Boolean(e[1])))
    },
  })
}
