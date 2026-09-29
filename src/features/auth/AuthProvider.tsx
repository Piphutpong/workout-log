import { createContext, useContext, useState, type ReactNode } from 'react'
import { getKey, setKey } from '@/lib/backend'
import { store } from '@/lib/store'
import { offlineDb } from '@/lib/offline/db'

interface AuthState {
  session: boolean
  loading: boolean
  signIn: (key: string) => void
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthState>({ session: false, loading: false, signIn: () => undefined, signOut: async () => undefined })

/** "ล็อกอิน" = มีรหัสผ่าน (API_KEY ของ Apps Script) เก็บไว้ในเครื่อง */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(Boolean(getKey()))
  const signIn = (key: string) => {
    setKey(key)
    setSession(true)
  }
  const signOut = async () => {
    setKey(null)
    await store.clear()
    await offlineDb.queue.clear().catch(() => undefined)
    setSession(false)
  }
  return <AuthContext.Provider value={{ session, loading: false, signIn, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
