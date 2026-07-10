import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CompanyBasic } from '@/types/company'

const STORAGE_KEY = 'metalradar_follows'

// 从 localStorage 恢复关注列表（刷新后立即显示，不等 API）
function loadCachedFollows(): CompanyBasic[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // 解析失败则忽略缓存
  }
  return []
}

function saveFollowsToCache(follows: CompanyBasic[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(follows))
  } catch {
    // localStorage 满了就忽略
  }
}

interface WatchlistContextValue {
  follows: CompanyBasic[]
  setFollows: (companies: CompanyBasic[]) => void
  addFollow: (company: CompanyBasic) => void
  removeFollow: (companyId: string) => void
  isFollowed: (companyId: string) => boolean
  isHydrated: boolean       // API 数据是否已加载
  markHydrated: () => void   // API 调用完成后标记（即使数据为空）
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  // 从 localStorage 恢复初始值，刷新时立即有数据显示
  const [follows, _setFollows] = useState<CompanyBasic[]>(loadCachedFollows)
  const [isHydrated, setIsHydrated] = useState(false)

  // 任何更新同时写入 localStorage
  const setFollows = useCallback((companies: CompanyBasic[]) => {
    _setFollows(companies)
    saveFollowsToCache(companies)
  }, [])

  const markHydrated = useCallback(() => setIsHydrated(true), [])

  const addFollow = useCallback((company: CompanyBasic) => {
    _setFollows((prev) => {
      if (prev.some((c) => c.id === company.id)) return prev
      const next = [...prev, company]
      saveFollowsToCache(next)
      return next
    })
  }, [])

  const removeFollow = useCallback((companyId: string) => {
    _setFollows((prev) => {
      const next = prev.filter((c) => c.id !== companyId)
      saveFollowsToCache(next)
      return next
    })
  }, [])

  const isFollowed = useCallback(
    (companyId: string) => follows.some((c) => c.id === companyId),
    [follows]
  )

  return (
    <WatchlistContext.Provider
      value={{ follows, setFollows, addFollow, removeFollow, isFollowed, isHydrated, markHydrated }}
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
