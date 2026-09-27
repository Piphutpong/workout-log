import { useAllBodyWeights } from '@/lib/api'
import { addDays, fmtDayMonth, todayIso } from '@/lib/date'
import { BarChart, ChartCard, LineChart, type Series } from '@/components/charts'
import { useDailyNutrition } from './api'

/** กราฟโภชนาการ 28 วัน: kcal (+เป้า) คู่กับน้ำหนักเฉลี่ย 7 วัน (แยกกราฟ แกนเดียว), โปรตีน, สัดส่วน P/C/F */
export function NutritionCharts() {
  const daily = useDailyNutrition(28)
  const weights = useAllBodyWeights()
  const today = todayIso()
  const dates = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27))
  const labels = dates.map(fmtDayMonth)
  const byDate = new Map((daily.data ?? []).map((d) => [d.date, d]))
  const w = weights.data ?? []
  const avg7 = dates.map((d) => {
    const v = w.filter((x) => x.date >= addDays(d, -6) && x.date <= d).map((x) => Number(x.weight_kg))
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null
  })

  const kcal: Series[] = [
    { label: 'kcal ที่กิน', data: dates.map((d) => (byDate.get(d) ? Number(byDate.get(d)!.kcal) : null)), slot: 0, points: true },
    { label: 'เป้า', data: dates.map((d) => byDate.get(d)?.target_kcal ?? null), slot: 'ref', dashed: true },
  ]
  const weight: Series[] = [{ label: 'น้ำหนักเฉลี่ย 7 วัน (กก.)', data: avg7, slot: 0 }]
  const protein: Series[] = [
    { label: 'โปรตีน (g)', data: dates.map((d) => (byDate.get(d) ? Number(byDate.get(d)!.protein_g) : null)), slot: 0 },
    { label: 'เป้า', data: dates.map((d) => byDate.get(d)?.target_protein_g ?? null), slot: 'ref', dashed: true },
  ]
  const share = (k: 'p' | 'c' | 'f') => dates.map((d) => {
    const x = byDate.get(d)
    if (!x) return null
    const p = Number(x.protein_g) * 4, c = Number(x.carb_g) * 4, f = Number(x.fat_g) * 9
    const t = p + c + f
    if (!t) return null
    return Math.round(((k === 'p' ? p : k === 'c' ? c : f) / t) * 100)
  })
  const pcf: Series[] = [
    { label: 'โปรตีน %', data: share('p'), slot: 0 },
    { label: 'คาร์บ %', data: share('c'), slot: 1 },
    { label: 'ไขมัน %', data: share('f'), slot: 2 },
  ]
  const empty = !(daily.data ?? []).length

  return (
    <>
      <ChartCard title="kcal รายวัน (28 วัน)" labels={labels} series={kcal} empty={empty}>
        <LineChart labels={labels} series={kcal} height={170} />
        <div className="mt-3 text-sm font-semibold text-slate-500">น้ำหนักเฉลี่ย 7 วัน (ช่วงเดียวกัน)</div>
        <LineChart labels={labels} series={weight} height={140} />
      </ChartCard>
      <ChartCard title="โปรตีนรายวัน" labels={labels} series={protein} empty={empty}>
        <LineChart labels={labels} series={protein} height={170} />
      </ChartCard>
      <ChartCard title="สัดส่วน P/C/F (% ของพลังงาน)" labels={labels} series={pcf} empty={empty}>
        <BarChart labels={labels} series={pcf} stacked height={170} yFormat={(v) => `${v}%`} />
      </ChartCard>
    </>
  )
}
