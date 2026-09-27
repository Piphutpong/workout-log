// การกาง/หุบการ์ดท่าในหน้าบันทึกเวท (มี unit test ใน openState.test.ts)

interface ExLike { key: string; superset?: string | null; warmup: boolean; sets: { key: string; done: boolean }[] }

/** key ของท่านี้ + ท่าคู่ใน superset เดียวกัน (กาง/หุบพร้อมกัน) */
export function withPartners(list: Pick<ExLike, 'key' | 'superset' | 'warmup'>[], key: string | undefined): string[] {
  const ex = list.find((e) => e.key === key)
  if (!ex) return []
  if (!ex.superset) return [ex.key]
  return list.filter((e) => e.superset === ex.superset && e.warmup === ex.warmup).map((e) => e.key)
}

/**
 * หลังติ๊กเซ็ต setKey ของท่า exKey ว่าเสร็จ:
 * ถ้าท่านี้ (และท่าคู่ใน superset) ครบทุกเซ็ต → หุบ แล้วกางท่าถัดไปที่ยังไม่เสร็จ
 */
export function advanceOpen(list: ExLike[], open: string[], exKey: string, setKey: string): string[] {
  const isDone = (e: ExLike) => e.sets.every((x) => x.done || (e.key === exKey && x.key === setKey))
  const group = withPartners(list, exKey)
  const members = list.filter((e) => group.includes(e.key))
  if (!members.length || !members.every(isDone)) return open
  const idx = Math.max(...group.map((k) => list.findIndex((e) => e.key === k)))
  const next = list.slice(idx + 1).find((e) => !isDone(e))
  return [...open.filter((k) => !group.includes(k)), ...(next ? withPartners(list, next.key) : [])]
}
