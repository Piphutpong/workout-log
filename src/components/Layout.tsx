import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSyncQueue } from '@/lib/offline/useSync'
import { cx, Spinner } from './ui'

const NAV = [
  { to: '/', label: 'ภาพรวม', icon: '📊', end: true },
  { to: '/today', label: 'วันนี้', icon: '📋' },
  { to: '/nutrition', label: 'อาหาร', icon: '🍽' },
  { to: '/workout', label: 'เวท', icon: '🏋️' },
  { to: '/run', label: 'วิ่ง', icon: '🏃' },
  { to: '/more', label: 'เพิ่มเติม', icon: '☰' },
]

function SyncBadge() {
  const { online, pending, failed, syncNow } = useSyncQueue()
  if (online && !pending && !failed) return null
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={cx(
        'rounded-full px-3 py-1 text-xs font-semibold',
        online ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {!online && 'ออฟไลน์'}
      {!online && pending > 0 && ' · '}
      {pending > 0 && `รอส่ง ${pending} รายการ`}
      {failed > 0 && ` · ส่งไม่สำเร็จ ${failed}`}
    </button>
  )
}

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-50/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 backdrop-blur dark:bg-slate-950/90">
        <span className="font-bold text-blue-700 dark:text-blue-300">Workout Log</span>
        <SyncBadge />
      </header>
      <main className="flex-1 px-4 pt-2 pb-28">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto grid max-w-2xl grid-cols-6">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500',
                )
              }
            >
              <span className="text-2xl leading-none">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
