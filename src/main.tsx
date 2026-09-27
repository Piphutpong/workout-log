import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { registerSW } from 'virtual:pwa-register'
import { idbPersister } from '@/lib/offline/persister'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 7 * 24 * 60 * 60 * 1000, // เก็บ cache ไว้ใช้ตอนออฟไลน์ 7 วัน
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always' },
  },
})

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: idbPersister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'v1' }}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)
