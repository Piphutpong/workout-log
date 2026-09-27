import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white active:bg-blue-700 disabled:bg-blue-600/40',
  secondary: 'bg-slate-200 text-slate-900 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:active:bg-slate-600',
  ghost: 'bg-transparent text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800',
  danger: 'bg-red-600 text-white active:bg-red-700',
  success: 'bg-emerald-600 text-white active:bg-emerald-700',
}

export function Button({
  variant = 'primary', size = 'md', block, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none disabled:opacity-60',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ children, color = 'slate', className }: { children: ReactNode; color?: 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet'; className?: string }) {
  const map = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  }
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', map[color], className)}>{children}</span>
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {(error as Error).message ?? String(error)}
    </div>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between text-sm font-medium text-slate-600 dark:text-slate-400">
      {children}
      {hint && <span className="text-xs font-normal">{hint}</span>}
    </span>
  )
}

// สีและกรอบของช่องกรอก (ไม่มีขนาด/padding เพื่อไม่ให้คลาสชนกัน — Tailwind ใช้ลำดับใน CSS ไม่ใช่ลำดับในคลาส)
const inputSkin =
  'rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const inputCls = cx(inputSkin, 'w-full min-h-12 px-3 text-base')

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string }>(
  function Input({ label, hint, error, className, ...rest }, ref) {
    return (
      <label className={cx('block', className)}>
        {label && <Label hint={hint}>{label}</Label>}
        <input ref={ref} className={cx(inputCls, error && 'border-red-500')} {...rest} />
        {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
      </label>
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode }>(
  function Select({ label, className, children, ...rest }, ref) {
    return (
      <label className={cx('block', className)}>
        {label && <Label>{label}</Label>}
        <select ref={ref} className={inputCls} {...rest}>
          {children}
        </select>
      </label>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode }>(
  function Textarea({ label, className, ...rest }, ref) {
    return (
      <label className={cx('block', className)}>
        {label && <Label>{label}</Label>}
        <textarea ref={ref} className={cx(inputCls, 'min-h-20 py-2')} {...rest} />
      </label>
    )
  },
)

/** ปุ่ม − ค่า + ขนาดใหญ่ */
export function Stepper({
  value, onChange, step = 1, min = 0, max = 9999, decimals = 0, suffix, className, compact,
}: {
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  decimals?: number
  suffix?: string
  className?: string
  compact?: boolean
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10 ** decimals) / 10 ** decimals))
  // ข้อความที่กำลังพิมพ์ (เก็บไว้ระหว่างพิมพ์ เพื่อให้พิมพ์ "12." ต่อเป็น "12.5" ได้)
  const [text, setText] = useState<string | null>(null)
  // ค่าถูกเปลี่ยนจากภายนอก (เช่น ปุ่ม +2.5lb ทุกเซ็ต) → ทิ้งข้อความที่พิมพ์ค้างไว้
  useEffect(() => {
    setText((t) => (t == null || (t === '' || t === '.' ? value === null : Number(t) === value) ? t : null))
  }, [value])
  const bump = (d: number) => {
    setText(null)
    onChange(clamp((value ?? 0) + d))
  }
  const btn = cx(
    'shrink-0 rounded-xl bg-slate-200 font-bold active:bg-slate-300 dark:bg-slate-700 dark:active:bg-slate-600',
    compact ? 'h-10 w-9 text-xl' : 'size-12 text-2xl',
  )
  return (
    <div className={cx('flex items-center gap-1', className)}>
      <button type="button" className={btn} onClick={() => bump(-step)} aria-label="ลด">
        −
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          inputMode="decimal"
          className={cx(inputSkin, 'w-full min-w-0 text-center font-semibold tabular-nums', compact ? 'min-h-10 px-0.5 text-lg' : 'min-h-12 px-1 text-lg')}
          value={text ?? (value ?? '')}
          onFocus={(e) => e.target.select()}
          onBlur={() => setText(null)}
          onChange={(e) => {
            const t = e.target.value.replace(',', '.')
            if (t !== '' && !/^\d*\.?\d*$/.test(t)) return
            setText(t)
            if (t === '' || t === '.') return onChange(null)
            const n = Number(t)
            if (!Number.isNaN(n)) onChange(n)
          }}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
      <button type="button" className={btn} onClick={() => bump(step)} aria-label="เพิ่ม">
        +
      </button>
    </div>
  )
}

/** ตัวเลือกแบบปุ่มเรียงแนวนอน */
export function Segmented<T extends string | number>({
  options, value, onChange, className,
}: { options: { value: T; label: ReactNode }[]; value: T | null; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold',
            o.value === value ? 'bg-white text-blue-700 shadow dark:bg-slate-950 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-slate-500">{children}</p>
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">{children}</h1>
      {action}
    </div>
  )
}

/** ช่องตัวเลขขนาดเล็ก (เช่น จำนวนครั้ง) */
export function NumInput({ value, onChange, className }: { value: number | null; onChange: (v: number | null) => void; className?: string }) {
  return (
    <input
      inputMode="numeric"
      className={cx(inputSkin, 'min-h-10 w-14 shrink-0 px-0.5 text-center text-lg font-semibold tabular-nums', className)}
      value={value ?? ''}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.trim()
        if (t === '') return onChange(null)
        const n = Number(t)
        if (Number.isInteger(n) && n >= 0) onChange(n)
      }}
    />
  )
}

/** แถบความคืบหน้า */
export function ProgressBar({ pct, tone = 'blue', className }: { pct: number; tone?: 'blue' | 'green' | 'amber'; className?: string }) {
  const color = tone === 'green' ? 'bg-emerald-600' : tone === 'amber' ? 'bg-amber-500' : 'bg-blue-600'
  return (
    <div className={cx('h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}
