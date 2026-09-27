// Modal, กล่องยืนยัน และ toast แบบเรียกใช้จากที่ไหนก็ได้
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { Button, cx } from './ui'

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-3 text-xl font-bold">{title}</h2>}
        {children}
        {footer && <div className="mt-4 flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ---- confirm ---------------------------------------------------------------
interface ConfirmState { message: ReactNode; okText: string; danger?: boolean; resolve: (v: boolean) => void }
let confirmState: ConfirmState | null = null
const confirmListeners = new Set<() => void>()
const setConfirm = (s: ConfirmState | null) => {
  confirmState = s
  confirmListeners.forEach((l) => l())
}

export function confirmDialog(message: ReactNode, opts: { okText?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => setConfirm({ message, okText: opts.okText ?? 'ยืนยัน', danger: opts.danger, resolve }))
}

/** ถ้ามีค่าหลุดช่วง ให้ถามยืนยันก่อน */
export async function confirmWarnings(warnings: string[]): Promise<boolean> {
  if (!warnings.length) return true
  return confirmDialog(
    <div className="space-y-2">
      <p>ค่าที่กรอกดูผิดปกติ:</p>
      <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300">
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
      <p>ต้องการบันทึกต่อหรือไม่?</p>
    </div>,
    { okText: 'บันทึกต่อ' },
  )
}

// ---- toast -----------------------------------------------------------------
interface Toast { id: number; text: ReactNode; action?: { label: string; run: () => void }; ms: number }
let toasts: Toast[] = []
const toastListeners = new Set<() => void>()
const emitToasts = () => toastListeners.forEach((l) => l())
let nextId = 1

export function toast(text: ReactNode, opts: { action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: nextId++, text, action: opts.action, ms: opts.ms ?? 3000 }
  toasts = [...toasts, t]
  emitToasts()
  setTimeout(() => dismiss(t.id), t.ms)
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emitToasts()
}

const sub = (set: Set<() => void>) => (l: () => void) => {
  set.add(l)
  return () => {
    set.delete(l)
  }
}

const subConfirm = sub(confirmListeners)
const subToasts = sub(toastListeners)

export function OverlayHost() {
  const c = useSyncExternalStore(subConfirm, () => confirmState)
  const ts = useSyncExternalStore(subToasts, () => toasts)
  const close = (v: boolean) => {
    c?.resolve(v)
    setConfirm(null)
  }
  return (
    <>
      <Modal
        open={Boolean(c)}
        onClose={() => close(false)}
        footer={
          <>
            <Button variant="secondary" block onClick={() => close(false)}>ยกเลิก</Button>
            <Button variant={c?.danger ? 'danger' : 'primary'} block onClick={() => close(true)}>{c?.okText}</Button>
          </>
        }
      >
        <div className="text-base">{c?.message}</div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {ts.map((t) => (
          <div
            key={t.id}
            className={cx('pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg dark:bg-slate-100 dark:text-slate-900')}
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="font-bold text-amber-300 dark:text-blue-700"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
