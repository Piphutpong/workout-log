import { useQuery } from '@tanstack/react-query'
import { supabase, currentUserId } from '@/lib/supabase'
import { uuid } from '@/lib/offline/queue'

export const BUCKET = 'progress-photos'
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

/** อัปโหลดไปที่ <user_id>/<date>_<angle>_<uuid>.jpg คืน storage path */
export async function uploadPhoto(blob: Blob, date: string, angle: Angle): Promise<string> {
  if (!navigator.onLine) throw new Error('อัปโหลดรูปต้องออนไลน์')
  const uid = await currentUserId()
  const path = `${uid}/${date}_${angle}_${uuid()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export async function removePhoto(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

/** signed URL (private bucket) อายุ 1 ชม. */
export function useSignedUrls(paths: string[]) {
  const key = [...paths].sort().join('|')
  return useQuery({
    queryKey: ['signed-urls', key],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (error) throw new Error(error.message)
      return new Map<string, string>((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? '', d.signedUrl as string]))
    },
  })
}
