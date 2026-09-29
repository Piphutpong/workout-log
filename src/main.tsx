import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { store } from '@/lib/store'
import App from './App'
import './index.css'

// ใช้กับข้อมูลภายนอก (รูปจาก Drive, สภาพอากาศ) — ข้อมูลหลักอ่านจาก store ในเครื่อง
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

registerSW({ immediate: true })

// รอโหลดข้อมูลจาก IndexedDB ก่อนแสดงหน้าแอป (เร็วมาก และใช้ได้แม้ออฟไลน์)
void store.ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
