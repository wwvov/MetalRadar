import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CompanyBasic } from '@/types/company'

interface WatchlistContextValue {
  follows: CompanyBasic[]
  setFollows: (companies: CompanyBasic[]) => void
  addFollow: (company: CompanyBasic) => void
  removeFollow: (companyId: string) => void
  isFollowed: (companyId: string) => boolean
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [follows, setFollows] = useState<CompanyBasic[]>([])

  const addFollow = useCallback((company: CompanyBasic) => {
    setFollows((prev) => {
      if (prev.some((c) => c.id === company.id)) return prev
      return [...prev, company]
    })
  }, [])

  const removeFollow = useCallback((companyId: string) => {
    setFollows((prev) => prev.filter((c) => c.id !== companyId))
  }, [])

  const isFollowed = useCallback(
    (companyId: string) => follows.some((c) => c.id === companyId),
    [follows]
  )

  return (
    <WatchlistContext.Provider
      value={{ follows, setFollows, addFollow, removeFollow, isFollowed }}
    >
      {children}
    </WatchlistContext.Provider>
  )
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext)
  if (!ctx) {
    throw new Error('useWatchlist must be used within WatchlistProvider')
  }
  return ctx
}
