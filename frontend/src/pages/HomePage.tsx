import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Newspaper,
  Building2,
  Boxes,
  Landmark,
  CheckCheck,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNews } from '@/hooks/useNews'
import { useNewsRefresh } from '@/hooks/useNewsRefresh'
import { useCompanyDetails } from '@/hooks/useCompany'
import { useWatchlist } from '@/providers'
import api from '@/services/api'
import { newsService } from '@/services/newsService'
import { MacroTicker } from '@/components/news/MacroTicker'
import { ShmetBlock } from '@/components/news/ShmetBlock'
import { NewsCard } from '@/components/news/NewsCard'
import { NewsSkeleton } from '@/components/news/NewsSkeleton'
import { ErrorCard } from '@/components/news/ErrorCard'
import { EmptyGuide } from '@/components/news/EmptyGuide'
import type { NewsTab } from '@/types/news'

// Tab 配置
const TABS: { value: NewsTab; label: string; icon: typeof Newspaper }[] = [
  { value: 'all', label: '全部', icon: Newspaper },
  { value: 'followed_companies', label: '关注公司', icon: Building2 },
  { value: 'sensitive_metals', label: '敏感品种', icon: Boxes },
  { value: 'macro', label: '宏观政策', icon: Landmark },
]

const REFRESH_COOLDOWN = 5000

export default function HomePage() {
  const { follows } = useWatchlist()
  const [activeTab, setActiveTab] = useState<NewsTab>('all')
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [metalFilter, setMetalFilter] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshCooldown, setRefreshCooldown] = useState(false)
  const lastRefreshTime = useRef(0)

  // 数据查询
  const macroQuery = useNews('macro_panel')
  const mainQuery = useNews(activeTab)
  // 批量获取所有关注公司的完整画像（含 materials）
  const companyDetails = useCompanyDetails(follows.map((f) => f.id))

  // 新闻刷新管道（akshare → LLM分类）
  const newsRefresh = useNewsRefresh(() => {
    macroQuery.refetch()
    mainQuery.refetch()
    setLastRefreshed(new Date())
  })

  // 首次加载时如果新闻数量不足，提示用户刷新（不自动触发，避免 SQLite 锁库 + akshare 反爬）
  const showRefreshHint = useMemo(() => {
    if (mainQuery.isLoading || macroQuery.isLoading) return false
    const totalNews = (mainQuery.data?.total || 0) + (macroQuery.data?.total || 0)
    return totalNews < 20
  }, [mainQuery.isLoading, macroQuery.isLoading, mainQuery.data?.total, macroQuery.data?.total])

  // 自动刷新
  useEffect(() => {
    macroQuery.refetch()
    mainQuery.refetch()
    setLastRefreshed(new Date())
  }, [])

  // 手动刷新
  const handleRefresh = useCallback(() => {
    const now = Date.now()
    if (now - lastRefreshTime.current < REFRESH_COOLDOWN) {
      setRefreshCooldown(true)
      setTimeout(() => setRefreshCooldown(false), REFRESH_COOLDOWN)
      return
    }
    lastRefreshTime.current = now
    setRefreshCooldown(true)
    setTimeout(() => setRefreshCooldown(false), REFRESH_COOLDOWN)
    macroQuery.refetch()
    mainQuery.refetch()
    setLastRefreshed(new Date())
  }, [macroQuery, mainQuery])

  // 收藏
  const handleFavorite = useCallback(
    async (newsId: string, linkedCompanyId?: string | null) => {
      try {
        await newsService.favoriteNews(newsId, linkedCompanyId)
        mainQuery.refetch()
        macroQuery.refetch()
      } catch {}
    },
    [mainQuery, macroQuery]
  )

  // 标记已读
  const handleMarkRead = useCallback(
    async (newsId: string) => {
      try {
        await newsService.markAsRead(newsId)
        mainQuery.refetch()
      } catch {}
    },
    [mainQuery]
  )

  // 全部已读
  const handleMarkAllRead = useCallback(async () => {
    const news = mainQuery.data?.news || []
    const unreadIds = news.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await api.post('/news/read-all', { news_ids: unreadIds })
      mainQuery.refetch()
    } catch {}
  }, [mainQuery])

  // 标签点击过滤（不切换Tab，避免清除筛选的死循环）
  const handleTagClick = useCallback(
    (type: 'company' | 'metal' | 'event', value: string) => {
      if (type === 'company') {
        setCompanyFilter(companyFilter === value ? null : value)
      } else if (type === 'metal') {
        setMetalFilter(metalFilter === value ? null : value)
      } else if (type === 'event') {
        setEventFilter(eventFilter === value ? null : value)
      }
    },
    [companyFilter, metalFilter, eventFilter]
  )

  // Tab 切换时保留标签筛选
  const handleTabChange = (v: string) => {
    setActiveTab(v as NewsTab)
  }

  // 过滤后的新闻列表
  const filteredNews = useMemo(() => {
    let news = mainQuery.data?.news || []
    if (activeTab === 'followed_companies' && companyFilter) {
      news = news.filter((n) => (n.company_entities || []).includes(companyFilter))
    }
    if (activeTab === 'sensitive_metals' && metalFilter) {
      news = news.filter((n) => (n.metal_entities || []).includes(metalFilter))
    }
    if (eventFilter) {
      news = news.filter((n) => n.event_type === eventFilter)
    }
    return news
  }, [mainQuery.data, activeTab, companyFilter, metalFilter, eventFilter])

  // 未读计数（每个 Tab）
  const tabUnreadCounts = useMemo(() => {
    const news = mainQuery.data?.news || []
    const unread = news.filter((n) => !n.is_read)
    const counts: Record<string, number> = {
      all: unread.length,
      followed_companies: unread.filter((n) =>
        (n.company_entities || []).some((c) => follows.some((f) => f.id === c))
      ).length,
      sensitive_metals: unread.filter((n) => (n.metal_entities || []).length > 0).length,
      macro: unread.filter((n) => n.relevance_level === 'gray').length,
    }
    return counts
  }, [mainQuery.data, follows])

  // 高预警数量（红色关联度 + 未读）
  const alertCount = useMemo(() => {
    return (mainQuery.data?.news || []).filter(
      (n) => n.relevance_level === 'red' && !n.is_read
    ).length
  }, [mainQuery.data])

  // 从关注公司的画像材料中提取可用品种列表（用于敏感品种筛选条）
  const availableMetals = useMemo(() => {
    // 1. 从所有关注公司的 portrait.materials 中收集品种名称
    const followedMaterials = new Set<string>()
    companyDetails.data.forEach((detail) => {
      (detail.portrait?.materials || []).forEach((m) => {
        if (m.material_name) {
          followedMaterials.add(m.material_name)
        }
      })
    })

    if (followedMaterials.size === 0) return []

    // 2. 统计每个品种在当前新闻列表中的出现次数
    const metals = new Map<string, number>()
    const allNews = mainQuery.data?.news || []
    allNews.forEach((n) => {
      (n.metal_entities || []).forEach((m) => {
        if (followedMaterials.has(m)) {
          metals.set(m, (metals.get(m) || 0) + 1)
        }
      })
    })

    // 3. 补充有画像但暂无新闻的品种（count=0，保留可见性）
    followedMaterials.forEach((m) => {
      if (!metals.has(m)) {
        metals.set(m, 0)
      }
    })

    return [...metals.entries()].sort((a, b) => b[1] - a[1])
  }, [mainQuery.data, companyDetails.data])

  // 敏感品种 Tab 匹配总数
  const sensitiveMetalTotal = useMemo(() => {
    const followedMaterials = new Set(availableMetals.map(([m]) => m))
    if (followedMaterials.size === 0) return 0
    return (mainQuery.data?.news || []).filter((n) =>
      (n.metal_entities || []).some((m) => followedMaterials.has(m))
    ).length
  }, [mainQuery.data, availableMetals])

  // 关注公司及其新闻计数
  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const allNews = mainQuery.data?.news || []
    follows.forEach((f) => {
      const count = allNews.filter((n) =>
        (n.company_entities || []).includes(f.id)
      ).length
      counts.set(f.id, count)
    })
    return counts
  }, [mainQuery.data, follows])

  const noFollows = follows.length === 0
  const totalNews = (mainQuery.data?.total || 0) + (macroQuery.data?.total || 0)

  return (
    <div className="min-h-full flex flex-col">
      {/* ===== 1. 顶部 Header (sticky) ===== */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* 左侧 */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[17px] font-semibold text-slate-900 whitespace-nowrap">
              新闻资讯
            </h1>
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-0 px-1.5 py-0">
              实时
            </Badge>
            <p className="hidden sm:block text-[11px] text-slate-500 truncate">
              多源融合 · 智能识别 · 关联预警
            </p>
          </div>

          {/* 右侧 */}
          <div className="flex items-center gap-3 shrink-0">
            {/* 新闻刷新状态 */}
            {newsRefresh.isRefreshing && (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[11px] truncate max-w-[200px]">
                  {newsRefresh.message}
                </span>
              </div>
            )}

            {/* 刷新按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] text-slate-500 hover:text-emerald-600"
              onClick={newsRefresh.startRefresh}
              disabled={newsRefresh.isRefreshing}
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1', newsRefresh.isRefreshing && 'animate-spin')} />
              刷新数据
            </Button>

            {/* 关注公司摘要 */}
            <div className="hidden lg:flex items-center gap-1.5 text-[12px] text-slate-600">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              关注公司 <span className="font-semibold text-slate-800">{follows.length}</span>
            </div>

            {/* 风险预警 */}
            {alertCount > 0 && (
              <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 rounded-lg px-2.5 py-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-[12px] font-medium">
                  <span className="hidden md:inline">{alertCount} 条</span>
                  高相关预警
                  <span className="md:hidden ml-0.5">{alertCount}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== 2. 宏观快讯滚动条 ===== */}
      <div className="px-6 pt-4">
        <MacroTicker
          news={macroQuery.data?.news || []}
          isLoading={macroQuery.isLoading}
          lastRefreshed={lastRefreshed}
          onRefresh={handleRefresh}
          refreshCooldown={refreshCooldown}
        />
      </div>

      {/* ===== 2.5 新闻数据不足提示 ===== */}
      {showRefreshHint && !newsRefresh.isRefreshing && (
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800">
                当前仅有 <strong>{totalNews}</strong> 条新闻，点击「刷新数据」从东方财富、上海金属网、新浪财经获取最新资讯
              </span>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={newsRefresh.startRefresh}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              立即刷新
            </Button>
          </div>
        </div>
      )}

      {/* ===== 3. 上海金属网专属区块 ===== */}
      <div className="px-6 pt-5">
        <ShmetBlock />
      </div>

      {/* ===== 4. 无关注公司引导 ===== */}
      {noFollows && (
        <div className="px-6 pt-5">
          <EmptyGuide />
        </div>
      )}

      {/* ===== 5. Tab 栏 + 筛选项 + 新闻列表 ===== */}
      <div className="px-6 pt-5 flex-1">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-col">
          {/* Tab 栏 (sticky) */}
          <div className="sticky top-[57px] z-10 bg-white border-b border-slate-200">
            <div className="flex items-center justify-between">
              <TabsList className="bg-transparent gap-0 -mb-[1px]">
                {TABS.map((tab) => {
                  const unread = tabUnreadCounts[tab.value]
                  const isActive = activeTab === tab.value
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-none border-b-2 border-transparent',
                        'data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:shadow-none',
                        'transition-all'
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                      {unread > 0 && (
                        <span
                          className={cn(
                            'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1',
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-rose-500 text-white'
                          )}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              {/* 右侧：总数 + 全部已读 */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[12px] text-slate-400">
                  共 {mainQuery.data?.total || 0} 条
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px] text-slate-500 hover:text-emerald-600"
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  全部已读
                </Button>
              </div>
            </div>

            {/* 筛选项（关注公司 Tab） */}
            {activeTab === 'followed_companies' && follows.length > 0 && (
              <div className="flex items-center gap-2 py-2 bg-slate-50/50 border-t border-slate-100 overflow-x-auto scrollbar-hide">
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 shrink-0 font-medium">
                  <Building2 className="w-3 h-3" />
                  按公司筛选
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 text-[11px] px-2 rounded-full',
                    !companyFilter
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  )}
                  onClick={() => setCompanyFilter(null)}
                >
                  全部 ({mainQuery.data?.news?.filter(n => (n.company_entities || []).some(c => follows.some(f => f.id === c))).length || 0})
                </Button>
                {follows.map((f) => {
                  const count = companyCounts.get(f.id) || 0
                  if (count === 0) return null
                  return (
                    <Button
                      key={f.id}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-6 text-[11px] px-2 rounded-full shrink-0',
                        companyFilter === f.id
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      )}
                      onClick={() =>
                        setCompanyFilter(companyFilter === f.id ? null : f.id)
                      }
                    >
                      {f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name} ({count})
                    </Button>
                  )
                })}
              </div>
            )}

            {/* 筛选项（敏感品种 Tab） */}
            {activeTab === 'sensitive_metals' && availableMetals.length > 0 && (
              <div className="flex items-center gap-2 py-2 bg-slate-50/50 border-t border-slate-100 overflow-x-auto scrollbar-hide">
                <span className="flex items-center gap-1 text-[11px] text-amber-600 shrink-0 font-medium">
                  <Boxes className="w-3 h-3" />
                  按品种筛选
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 text-[11px] px-2 rounded-full',
                    !metalFilter
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  )}
                  onClick={() => setMetalFilter(null)}
                >
                  全部 ({sensitiveMetalTotal})
                </Button>
                {availableMetals.map(([metal, count]) => (
                  <Button
                    key={metal}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 text-[11px] px-2 rounded-full shrink-0',
                      metalFilter === metal
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    )}
                    onClick={() =>
                      setMetalFilter(metalFilter === metal ? null : metal)
                    }
                  >
                    {metal} ({count})
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Tab 内容 */}
          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-0 pt-3">
              {mainQuery.isLoading ? (
                <NewsSkeleton />
              ) : mainQuery.isError ? (
                <ErrorCard onRetry={() => mainQuery.refetch()} />
              ) : filteredNews.length === 0 ? (
                <div className="text-center py-16 text-sm text-slate-400">
                  {tab.value === 'followed_companies' && noFollows
                    ? '请先在「我的关注」中添加公司'
                    : '暂无相关新闻'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredNews.map((item) => (
                    <NewsCard
                      key={item.id}
                      news={item}
                      followedCompanyNames={
                        new Map(follows.map((c) => [c.id, c.name]))
                      }
                      isMacroMode={activeTab === 'macro'}
                      onFavorite={handleFavorite}
                      onMarkRead={handleMarkRead}
                      onTagClick={handleTagClick}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ===== 4. 底部 Footer ===== */}
      <footer className="px-6 pt-4 pb-6">
        <p className="text-center text-[11px] text-slate-400">
          数据来源：东方财富 · 上海金属网 · 新浪财经 · 财联社 · 富途牛牛 · 同花顺
          · 仅供研究参考，不构成投资建议
        </p>
      </footer>
    </div>
  )
}
