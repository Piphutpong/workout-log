import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

/** รายการที่ลากเรียงลำดับได้ (รองรับนิ้ว/เมาส์ด้วย Pointer Events) */
export function SortableList<T>({ items, keyOf, onReorder, render }: {
  items: T[]
  keyOf: (item: T) => string
  onReorder: (items: T[]) => void
  render: (item: T, handle: ReactNode, index: number) => ReactNode
}) {
  const [order, setOrder] = useState(items)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    if (!dragKey) setOrder(items)
  }, [items, dragKey])

  useEffect(() => {
    if (!dragKey) return
    const move = (e: PointerEvent) => {
      e.preventDefault()
      const cur = orderRef.current
      const from = cur.findIndex((it) => keyOf(it) === dragKey)
      for (let i = 0; i < cur.length; i++) {
        if (i === from) continue
        const el = refs.current.get(keyOf(cur[i]))
        if (!el) continue
        const r = el.getBoundingClientRect()
        const mid = r.top + r.height / 2
        if ((i < from && e.clientY < mid) || (i > from && e.clientY > mid)) {
          const next = [...cur]
          const [it] = next.splice(from, 1)
          next.splice(i, 0, it)
          setOrder(next)
          break
        }
      }
    }
    const up = () => {
      setDragKey(null)
      const changed = orderRef.current.some((it, i) => keyOf(it) !== keyOf(items[i]))
      if (changed) onReorder(orderRef.current)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragKey, items, keyOf, onReorder])

  return (
    <ul className="space-y-2">
      {order.map((item, i) => {
        const k = keyOf(item)
        const handle = (
          <span
            role="button"
            aria-label="ลากเพื่อเรียงลำดับ"
            className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-slate-400 active:bg-slate-200 dark:active:bg-slate-700"
            onPointerDown={(e) => {
              e.preventDefault()
              setDragKey(k)
            }}
          >
            ⠿
          </span>
        )
        return (
          <li
            key={k}
            ref={(el) => {
              if (el) refs.current.set(k, el)
              else refs.current.delete(k)
            }}
            className={cx(dragKey === k && 'relative z-10 scale-[1.02] opacity-90 shadow-lg')}
          >
            {render(item, handle, i)}
          </li>
        )
      })}
    </ul>
  )
}
