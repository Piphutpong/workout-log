import { Link } from 'react-router-dom'
import { todayIso } from '@/lib/date'
import { Button, Card, Spinner } from '@/components/ui'
import { DAY_TYPE_TH, MacroSummary } from '@/features/nutrition/MacroSummary'
import { useNutritionDay } from '@/features/nutrition/useNutritionDay'

/** โภชนาการบนหน้าวันนี้: วงแหวน kcal + แถบ P/C/F เทียบเป้าของวัน + ปุ่มน้ำ */
export function NutritionMini() {
  const day = useNutritionDay(todayIso())
  return (
    <Card title={`🍽 โภชนาการ · ${DAY_TYPE_TH[day.dayType]}`} action={<Link to="/nutrition" className="text-sm text-blue-700 dark:text-blue-300">บันทึก →</Link>}>
      {day.target ? <MacroSummary eaten={day.eaten} target={day.target} /> : <Spinner />}
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 text-sm">💧 น้ำ <b className="tabular-nums">{(day.waterMl / 1000).toFixed(2)}</b> ล.</span>
        <Button size="sm" variant="secondary" onClick={() => void day.addWater(250)}>+250</Button>
        <Button size="sm" variant="secondary" onClick={() => void day.addWater(500)}>+500</Button>
      </div>
    </Card>
  )
}
