import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, qk, useSettings } from '@/lib/api'
import { fmtDate, todayIso, weekStart } from '@/lib/date'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { confirmDialog, toast } from '@/components/overlay'
import { nk, useTargets, useTdeeInputs, useTdeeProposals } from './api'
import { applyKcalDelta, computeTdee, proposeKcal } from './nutritionCalc'

/**
 * Adaptive TDEE: คำนวณจาก 14-28 วันล่าสุด
 * ทุกวันจันทร์ (ครั้งแรกที่เปิดในสัปดาห์) สร้างข้อเสนอปรับ kcal — ต้องกดยืนยันก่อนเปลี่ยน ห้ามเปลี่ยนเอง
 */
export function TdeeCard() {
  const qc = useQueryClient()
  const inputs = useTdeeInputs()
  const proposals = useTdeeProposals()
  const targets = useTargets()
  const settings = useSettings()
  const creating = useRef(false)
  const ws = weekStart(todayIso())

  const i = inputs.data
  const result = i ? computeTdee(i) : null
  const mode = settings.data?.nutrition_mode ?? 'cut'
  const current = proposals.data?.find((p) => p.week_start === ws)
  const proposal = result?.ok && i?.current_avg_target ? proposeKcal(result.tdee, i.current_avg_target, mode) : null

  // สร้างข้อเสนอของสัปดาห์นี้ครั้งเดียว
  useEffect(() => {
    if (!i || !proposals.data || current || creating.current || !navigator.onLine) return
    creating.current = true
    const row = result?.ok && proposal
      ? {
          week_start: ws, mode, tdee: result.tdee, avg_kcal: result.avgKcal, weight_change_kg: result.weightChange,
          window_days: result.window, days_logged: result.daysLogged, current_avg_target: i.current_avg_target,
          proposed_delta: proposal.delta, status: (Math.abs(proposal.delta) >= 50 ? 'pending' : 'dismissed') as 'pending' | 'dismissed',
        }
      : { week_start: ws, mode, days_logged: result?.daysLogged ?? 0, status: 'insufficient' as const }
    void upsertRows('tdee_proposals', [row], 'user_id,week_start')
      .then(() => qc.invalidateQueries({ queryKey: nk.proposals }))
      .finally(() => { creating.current = false })
  }, [i, proposals.data, current, result, proposal, mode, ws, qc])

  if (inputs.isLoading || !i) return <Card title="🔥 Adaptive TDEE"><Spinner /></Card>

  const accept = async () => {
    if (!current?.proposed_delta || !targets.data) return
    const d = current.proposed_delta
    if (!(await confirmDialog(`ปรับเป้าแคลอรี่ทุกประเภทวัน ${d > 0 ? '+' : ''}${d} kcal/วัน (คาร์บ ${d > 0 ? '+' : ''}${Math.round(d / 4)} g, โปรตีนคงที่)?`))) return
    for (const t of applyKcalDelta(targets.data, d)) await updateRows('nutrition_targets', [t.id], { kcal: t.kcal, carb_g: t.carb_g })
    await updateRows('tdee_proposals', [current.id], { status: 'accepted' })
    await Promise.all([qc.invalidateQueries({ queryKey: nk.targets }), qc.invalidateQueries({ queryKey: nk.proposals }), invalidateDash(qc)])
    toast('ปรับเป้าแคลอรี่แล้ว')
  }
  const dismiss = async () => {
    if (!current) return
    await updateRows('tdee_proposals', [current.id], { status: 'dismissed' })
    await qc.invalidateQueries({ queryKey: nk.proposals })
  }
  const switchMode = async (m: 'cut' | 'maintenance') => {
    if (!settings.data) return
    await updateRows('settings', [settings.data.id], { nutrition_mode: m })
    // สร้างข้อเสนอใหม่ของสัปดาห์นี้ตามโหมดใหม่
    if (result?.ok && i.current_avg_target) {
      const p = proposeKcal(result.tdee, i.current_avg_target, m)
      await upsertRows('tdee_proposals', [{
        id: current?.id, week_start: ws, mode: m, tdee: result.tdee, avg_kcal: result.avgKcal, weight_change_kg: result.weightChange,
        window_days: result.window, days_logged: result.daysLogged, current_avg_target: i.current_avg_target,
        proposed_delta: p.delta, status: Math.abs(p.delta) >= 50 ? 'pending' : 'dismissed',
      }], 'user_id,week_start')
    }
    await Promise.all([qc.invalidateQueries({ queryKey: qk.settings }), qc.invalidateQueries({ queryKey: nk.proposals }), qc.invalidateQueries({ queryKey: nk.tdee })])
  }

  return (
    <Card title="🔥 Adaptive TDEE" action={<Badge color={mode === 'cut' ? 'blue' : 'green'}>{mode === 'cut' ? 'โหมดลดน้ำหนัก' : 'โหมด maintenance'}</Badge>}>
      {result?.ok ? (
        <>
          <div className="text-3xl font-bold tabular-nums">{result.tdee.toLocaleString()} <span className="text-base font-normal text-slate-500">kcal/วัน</span></div>
          <p className="text-sm text-slate-500">
            จาก {result.window} วันล่าสุด (บันทึกอาหาร {result.daysLogged} วัน) · กินเฉลี่ย {result.avgKcal.toLocaleString()} kcal ·
            น้ำหนักเฉลี่ย 7 วัน {result.weightChange > 0 ? '+' : ''}{result.weightChange} กก.
          </p>
          {proposal && i.current_avg_target && (
            <p className="mt-1 text-sm">
              เป้าเฉลี่ยตอนนี้ {i.current_avg_target.toLocaleString()} kcal → คาดว่า{proposal.lossPerWeekNow >= 0 ? 'ลด' : 'เพิ่ม'} {Math.abs(proposal.lossPerWeekNow)} กก./สัปดาห์
            </p>
          )}
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">ข้อมูลไม่พอ — {result && !result.ok ? result.reason : ''}</p>
      )}

      {current?.status === 'pending' && current.proposed_delta != null && (
        <div className="mt-3 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/50">
          <div className="text-sm font-semibold">ข้อเสนอประจำสัปดาห์ {fmtDate(ws)}</div>
          <p className="mt-1 text-sm">
            ปรับเป้า <b>{current.proposed_delta > 0 ? '+' : ''}{current.proposed_delta} kcal/วัน</b> (คาร์บ {current.proposed_delta > 0 ? '+' : ''}{Math.round(current.proposed_delta / 4)} g)
            {current.mode === 'cut' ? ' เพื่อให้ลด 0.3-0.4 กก./สัปดาห์' : ' ให้เท่ากับ TDEE (คงน้ำหนัก)'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={() => void dismiss()}>ไม่เปลี่ยน</Button>
            <Button size="sm" onClick={() => void accept()}>ยืนยันปรับ</Button>
          </div>
        </div>
      )}
      {current?.status === 'accepted' && <p className="mt-2 text-sm text-emerald-600">✓ ปรับเป้าสัปดาห์นี้แล้ว ({current.proposed_delta! > 0 ? '+' : ''}{current.proposed_delta} kcal)</p>}
      {current?.status === 'dismissed' && current.proposed_delta != null && Math.abs(current.proposed_delta) < 50 && (
        <p className="mt-2 text-sm text-emerald-600">✓ เป้าปัจจุบันเหมาะสมแล้ว</p>
      )}

      {i.weight_goal_done && mode === 'cut' && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/50">
          🎯 ถึงเป้าน้ำหนักแล้ว — แนะนำเปลี่ยนเป็นโหมด maintenance (kcal = TDEE ล่าสุด{result?.ok ? ` ≈ ${result.tdee}` : ''})
          <Button className="mt-2" size="sm" variant="success" onClick={() => void switchMode('maintenance')}>เปลี่ยนเป็น maintenance</Button>
        </div>
      )}
      {mode === 'maintenance' && (
        <Button className="mt-2" size="sm" variant="ghost" onClick={() => void switchMode('cut')}>กลับไปโหมดลดน้ำหนัก</Button>
      )}
      <p className="mt-2 text-xs text-slate-500">TDEE = kcal เฉลี่ย − (น้ำหนักเฉลี่ย 7 วันที่เปลี่ยน × 7,700 ÷ จำนวนวัน) · ค่าประมาณ ไม่ใช่คำแนะนำทางการแพทย์</p>
    </Card>
  )
}
