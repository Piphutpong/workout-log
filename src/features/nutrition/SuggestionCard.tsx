import { useMemo } from 'react'
import { Card } from '@/components/ui'
import type { DayType, Food } from '@/types/database'
import { useFoodUsage, useFoods } from './api'
import type { DayTarget } from './MacroSummary'
import { fmtServings, suggestProtein, type Macros } from './nutritionCalc'

/** แนะนำตามส่วนที่ขาด (เลือกจากคลังอาหารของผู้ใช้) */
export function SuggestionCard({ eaten, target, dayType }: { eaten: Macros; target: DayTarget; dayType: DayType }) {
  const foods = useFoods()
  const usage = useFoodUsage()
  const usageMap = useMemo(() => new Map((usage.data ?? []).filter((u) => u.food_id).map((u) => [u.food_id!, Number(u.uses)])), [usage.data])
  const pGap = Math.round(target.protein_g - eaten.protein_g)
  const cGap = Math.round(target.carb_g - eaten.carb_g)
  const kLeft = Math.round(target.kcal - eaten.calories)
  const protein = suggestProtein(pGap, foods.data ?? [], usageMap)

  const carbFoods = (foods.data ?? [])
    .filter((f: Food) => ['ข้าว/แป้ง', 'ผลไม้'].includes(f.category ?? '') && Number(f.carb_g) >= 15 && Number(f.fat_g) <= 3)
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (usageMap.get(b.id) ?? 0) - (usageMap.get(a.id) ?? 0))
    .slice(0, 2)
  const carbText = carbFoods.map((f) => `${f.name} ${fmtServings(Math.min(4, Math.max(0.5, Math.round((cGap / Number(f.carb_g)) * 2) / 2)))} ${(f.serving_desc ?? '').replace(/^[\d/.]+\s*/, '')}`)

  const lines: string[] = []
  if (protein.length) lines.push(`โปรตีนขาด ${pGap} g → ${protein.map((s) => `${s.text} (~${s.calories} kcal)`).join(' หรือ ')}`)
  if (dayType === 'run_hard' && cGap >= 50 && carbText.length) lines.push(`วันนี้วิ่งหนัก คาร์บยังขาด ${cGap} g → ${carbText.join(' หรือ ')}`)
  if (kLeft < -200) lines.push(`เกินเป้าแคลอรี่ ${-kLeft} kcal — มื้อถัดไปเน้นโปรตีน/ผัก ลดของทอดและเครื่องดื่มหวาน`)
  if (!lines.length) return null
  return (
    <Card title="💡 แนะนำ">
      <ul className="space-y-2 text-sm">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </Card>
  )
}
