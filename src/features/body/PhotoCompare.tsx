import { useEffect, useMemo, useState } from 'react'
import { useProgressPhotos } from '@/lib/api'
import { fmtDate } from '@/lib/date'
import { Card, Segmented, Select } from '@/components/ui'
import { ANGLE_TH, useSignedUrls, type Angle } from './photos'

/** รูปก่อน-หลัง: เลือก 2 วัน แสดงมุมเดียวกันแบบ side-by-side */
export function PhotoCompare() {
  const photos = useProgressPhotos()
  const [angle, setAngle] = useState<Angle>('front')
  const list = useMemo(() => (photos.data ?? []).filter((p) => p.angle === angle), [photos.data, angle])
  const dates = [...new Set(list.map((p) => p.date))].sort()
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  useEffect(() => {
    setA(dates[0] ?? '')
    setB(dates[dates.length - 1] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle, dates.length])

  const pa = list.find((p) => p.date === a)
  const pb = list.find((p) => p.date === b)
  const urls = useSignedUrls([pa?.storage_path, pb?.storage_path].filter(Boolean) as string[])

  return (
    <Card title="📸 รูปก่อน-หลัง">
      <Segmented value={angle} onChange={setAngle} options={(Object.keys(ANGLE_TH) as Angle[]).map((k) => ({ value: k, label: ANGLE_TH[k] }))} />
      {dates.length < 1 ? (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีรูปมุมนี้ — อัปโหลดได้ที่หน้า "ร่างกาย"</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select value={a} onChange={(e) => setA(e.target.value)}>{dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}</Select>
            <Select value={b} onChange={(e) => setB(e.target.value)}>{dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}</Select>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[pa, pb].map((p, i) => (
              <figure key={i} className="overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                {p && urls.data?.get(p.storage_path) ? (
                  <img src={urls.data.get(p.storage_path)} alt={`${ANGLE_TH[angle]} ${fmtDate(p.date)}`} className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="aspect-[3/4]" />
                )}
                {p && (
                  <figcaption className="p-2 text-center text-xs">
                    {fmtDate(p.date)}{p.weight_kg ? ` · ${p.weight_kg} กก.` : ''}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
