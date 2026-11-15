import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loginUser, loginWithGoogle, getCurrentUser, logoutUser, deleteUserAccount } from '@/api/authApi'
import type { User } from '@/types'

interface AuthValue {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<User>
  signInWithGoogle: (credential: string) => Promise<User>
  signOut: () => void
  deleteAccount: (password?: string) => Promise<void>
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, ask the backend if there's already a valid session cookie.
  // This replaces the old localStorage/mock-array lookup.
  useEffect(() => {
    ;(async () => {
      try {
        const current = await getCurrentUser()
        setUserState(current)
      } catch {
        setUserState(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password, remember) => {
        const next = await loginUser(email, password, remember)
        setUserState(next)
        return next
      },
      signInWithGoogle: async (credential) => {
        const next = await loginWithGoogle(credential)
        setUserState(next)
        return next
      },
      signOut: () => {
        logoutUser().catch(() => {})
        setUserState(null)
      },
      deleteAccount: async (password?: string) => {
      await deleteUserAccount(password) // do not use .catch(() => undefined)
      setUserState(null)
      },
      setUser: setUserState,
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
