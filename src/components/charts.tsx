// กราฟ (Chart.js) — ใช้พาเลตต์ที่ผ่านการตรวจ CVD แยกค่าโหมดสว่าง/มืด, แกนเดียว, เส้น 2px,
// tooltip แบบ crosshair, มี legend เมื่อ ≥ 2 ชุด และมีปุ่มดูเป็นตาราง
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
  type ChartData, type ChartOptions,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { Card } from './ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}
const INK = {
  light: { text: '#52514e', grid: 'rgba(0,0,0,0.07)', ref: '#8a8985', surface: '#ffffff' },
  dark: { text: '#c3c2b7', grid: 'rgba(255,255,255,0.08)', ref: '#8f8e87', surface: '#0f172a' },
}

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
function useDark() {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => Boolean(mq?.matches),
  )
}

export function useChartTheme() {
  const dark = useDark()
  const mode = dark ? 'dark' : 'light'
  return { series: PALETTE[mode], ...INK[mode], dark }
}

export interface Series {
  label: string
  data: (number | null)[]
  /** ช่องสีตามลำดับพาเลตต์ (0-7) หรือ 'ref' = เส้นอ้างอิงสีเทา */
  slot: number | 'ref'
  dashed?: boolean
  points?: boolean
  /** แสดงเป็นจุดอย่างเดียว (ไม่มีเส้น) */
  dotsOnly?: boolean
  format?: (v: number) => string
}

function baseOptions(theme: ReturnType<typeof useChartTheme>, series: Series[], yTitle?: string, yReverse?: boolean, yFormat?: (v: number) => string): ChartOptions<'line' | 'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: series.length >= 2,
        position: 'top',
        align: 'start',
        labels: { color: theme.text, boxWidth: 12, boxHeight: 12, usePointStyle: true, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const s = series[ctx.datasetIndex]
            const v = ctx.parsed.y
            if (v == null) return ''
            return ` ${s.label}: ${s.format ? s.format(v) : yFormat ? yFormat(v) : v.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: theme.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 11 } }, grid: { display: false } },
      y: {
        reverse: yReverse,
        title: yTitle ? { display: true, text: yTitle, color: theme.text, font: { size: 11 } } : undefined,
        ticks: { color: theme.text, font: { size: 11 }, callback: yFormat ? (v) => yFormat(Number(v)) : undefined },
        grid: { color: theme.grid },
        border: { display: false },
      },
    },
  }
}

export function LineChart({ labels, series, yTitle, yReverse, yFormat, height = 220 }: {
  labels: string[]
  series: Series[]
  yTitle?: string
  yReverse?: boolean
  yFormat?: (v: number) => string
  height?: number
}) {
  const theme = useChartTheme()
  const data: ChartData<'line'> = {
    labels,
    datasets: series.map((s) => {
      const color = s.slot === 'ref' ? theme.ref : theme.series[s.slot]
      return {
        label: s.label,
        data: s.data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: s.dotsOnly ? 0 : 2,
        borderDash: s.dashed ? [6, 4] : undefined,
        showLine: !s.dotsOnly,
        pointRadius: s.dotsOnly || s.points ? 4 : 0,
        pointHoverRadius: 6,
        pointBorderColor: theme.surface,
        pointBorderWidth: s.dotsOnly || s.points ? 2 : 0,
        spanGaps: true,
        tension: 0.25,
      }
    }),
  }
  return (
    <div style={{ height }}>
      <Line data={data} options={baseOptions(theme, series, yTitle, yReverse, yFormat) as ChartOptions<'line'>} />
    </div>
  )
}

export function BarChart({ labels, series, yTitle, yFormat, height = 200, stacked }: {
  labels: string[]
  series: Series[]
  yTitle?: string
  yFormat?: (v: number) => string
  height?: number
  stacked?: boolean
}) {
  const theme = useChartTheme()
  const data: ChartData<'bar'> = {
    labels,
    datasets: series.map((s) => {
      const color = s.slot === 'ref' ? theme.ref : theme.series[s.slot]
      return {
        label: s.label,
        data: s.data,
        backgroundColor: color,
        borderColor: theme.surface,
        borderWidth: { top: 0, left: 1, right: 1, bottom: 0 },
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        maxBarThickness: 28,
      }
    }),
  }
  const options = baseOptions(theme, series, yTitle, false, yFormat) as ChartOptions<'bar'>
  if (stacked && options.scales) {
    options.scales.x = { ...options.scales.x, stacked: true }
    options.scales.y = { ...options.scales.y, stacked: true }
  }
  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  )
}

/** การ์ดกราฟ + ปุ่มสลับดูเป็นตาราง */
export function ChartCard({ title, children, labels, series, empty, action }: {
  title: ReactNode
  children: ReactNode
  labels: string[]
  series: Series[]
  empty?: boolean
  action?: ReactNode
}) {
  const [table, setTable] = useState(false)
  return (
    <Card
      title={title}
      action={
        <div className="flex items-center gap-2">
          {action}
          {!empty && (
            <button type="button" className="text-xs text-blue-700 dark:text-blue-300" onClick={() => setTable(!table)}>
              {table ? 'กราฟ' : 'ตาราง'}
            </button>
          )}
        </div>
      }
    >
      {empty ? (
        <p className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
      ) : table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="text-left text-slate-500">
                <th className="py-1">วันที่</th>
                {series.map((s) => <th key={s.label} className="text-right">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={`${l}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{l}</td>
                  {series.map((s) => {
                    const v = s.data[i]
                    return <td key={s.label} className="text-right">{v == null ? '-' : s.format ? s.format(v) : Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  )
}

export { ProgressBar } from './ui'
