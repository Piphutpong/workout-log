import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { deleteRows, upsertRows, uuid } from '@/lib/offline/queue'
import { Button, Card, Empty, ErrorBox, Input, PageTitle, Select, Spinner, Textarea } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import type { Food, Recipe, RecipeItem } from '@/types/database'
import { nk, useFoods, useRecipes } from './api'
import { recipePerServing } from './nutritionCalc'

/** สูตรอาหาร (meal prep): รวมวัตถุดิบเป็นกรัม แล้วแบ่งเป็นเสิร์ฟ */
export function RecipesPage() {
  const recipes = useRecipes()
  const foods = useFoods()
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const foodById = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f])), [foods.data])

  if (recipes.isLoading || foods.isLoading) return <Spinner />
  return (
    <div className="space-y-4">
      <PageTitle action={<Button size="sm" onClick={() => setEditing('new')}>+ สูตร</Button>}>สูตรอาหาร</PageTitle>
      <Link to="/nutrition" className="-mt-2 block text-sm text-blue-700 dark:text-blue-300">← โภชนาการ</Link>
      {(recipes.data?.recipes ?? []).map((r) => {
        const items = (recipes.data?.items ?? []).filter((i) => i.recipe_id === r.id)
        let per = null
        try {
          per = recipePerServing(items.map((i) => ({ food: foodById.get(i.food_id)!, amount_g: Number(i.amount_g) })).filter((x) => x.food), Number(r.servings))
        } catch { /* อาหารไม่มี serving_g */ }
        return (
          <Card key={r.id} className="!p-3">
            <button type="button" className="w-full text-left" onClick={() => setEditing(r)}>
              <div className="font-bold">🍱 {r.name} <span className="text-sm font-normal text-slate-500">· {Number(r.servings)} เสิร์ฟ</span></div>
              {per && <div className="text-sm text-slate-500">ต่อเสิร์ฟ {per.calories} kcal · P {per.protein_g} · C {per.carb_g} · F {per.fat_g}</div>}
              <div className="truncate text-xs text-slate-400">{items.map((i) => `${foodById.get(i.food_id)?.name ?? '?'} ${Number(i.amount_g)}g`).join(', ')}</div>
            </button>
          </Card>
        )
      })}
      {!recipes.data?.recipes.length && <Empty>ยังไม่มีสูตร — สร้างสูตรจากวัตถุดิบ เช่น อกไก่ดิบ 1000 g + ข้าวกล้องดิบ 500 g แบ่ง 5 กล่อง</Empty>}
      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? null : editing}
          items={editing === 'new' ? [] : (recipes.data?.items ?? []).filter((i) => i.recipe_id === editing.id)}
          foods={foods.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function RecipeEditor({ recipe, items, foods, onClose }: { recipe: Recipe | null; items: RecipeItem[]; foods: Food[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(recipe?.name ?? '')
  const [servings, setServings] = useState(String(recipe?.servings ?? 4))
  const [note, setNote] = useState(recipe?.note ?? '')
  const [rows, setRows] = useState(items.map((i) => ({ id: i.id, food_id: i.food_id, amount_g: String(i.amount_g) })))
  const [adding, setAdding] = useState('')
  const [error, setError] = useState<unknown>(null)
  const usable = foods.filter((f) => Number(f.serving_g) > 0)
  const byId = new Map(foods.map((f) => [f.id, f]))
  let per = null
  try {
    per = recipePerServing(rows.filter((r) => byId.get(r.food_id) && Number(r.amount_g) > 0)
      .map((r) => ({ food: byId.get(r.food_id)!, amount_g: Number(r.amount_g) })), Number(servings) || 1)
  } catch { per = null }

  const save = async () => {
    setError(null)
    try {
      if (!name.trim()) throw new Error('กรอกชื่อสูตร')
      if (!rows.length) throw new Error('เพิ่มวัตถุดิบอย่างน้อย 1 อย่าง')
      const id = recipe?.id ?? uuid()
      await upsertRows('recipes', [{ id, name: name.trim(), servings: Number(servings) || 1, note: note || null }])
      const removed = items.filter((i) => !rows.some((r) => r.id === i.id)).map((i) => i.id)
      if (removed.length) await deleteRows('recipe_items', removed)
      await upsertRows('recipe_items', rows.map((r) => ({ id: r.id, recipe_id: id, food_id: r.food_id, amount_g: Number(r.amount_g) || 0 })))
      await qc.invalidateQueries({ queryKey: nk.recipes })
      toast('บันทึกสูตรแล้ว')
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  const del = async () => {
    if (!recipe || !(await confirmDialog(`ลบสูตร ${recipe.name}?`, { danger: true, okText: 'ลบ' }))) return
    await deleteRows('recipes', [recipe.id])
    await qc.invalidateQueries({ queryKey: nk.recipes })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={recipe ? 'แก้สูตร' : 'สูตรใหม่'}
      footer={<>{recipe && <Button variant="danger" onClick={() => void del()}>ลบ</Button>}<Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={() => void save()}>บันทึก</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Input label="ชื่อสูตร" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="จำนวนเสิร์ฟ" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id ?? i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{byId.get(r.food_id)?.name ?? '?'}</span>
              <input inputMode="decimal" className="min-h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center dark:border-slate-700 dark:bg-slate-950"
                value={r.amount_g} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount_g: e.target.value } : x)))} />
              <span className="text-sm text-slate-500">g</span>
              <button type="button" className="p-2 text-slate-400" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="ลบ">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Select className="flex-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">+ วัตถุดิบ (อาหารที่มีน้ำหนัก/หน่วย)</option>
            {usable.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.serving_desc})</option>)}
          </Select>
          <Button disabled={!adding} onClick={() => {
            setRows([...rows, { id: uuid(), food_id: adding, amount_g: String(byId.get(adding)?.serving_g ?? 100) }])
            setAdding('')
          }}>เพิ่ม</Button>
        </div>
        {per && <p className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60">ต่อเสิร์ฟ: <b>{per.calories} kcal</b> · P {per.protein_g} g · C {per.carb_g} g · F {per.fat_g} g</p>}
        <Textarea label="โน้ต" value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

