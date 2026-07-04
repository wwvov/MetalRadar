import { useRef, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/utils/formatters'
import { EVENT_TYPE_LABELS } from '@/types/news'
import type { NewsItem } from '@/types/news'

interface MacroPanelProps {
  news: NewsItem[]
  isLoading: boolean
  isError: boolean
  lastUpdated: Date | null
  onRefresh: () => void
}

export function MacroPanel({ news, isLoading, isError, lastUpdated, onRefresh }: MacroPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.addEventListener('scroll', checkScroll, { passive: true })
    checkScroll()
    return () => { if (el) el.removeEventListener('scroll', checkScroll) }
  }, [news])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  // 更新时间提示
  const minutesAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 60000) : 0
  const staleHint = minutesAgo > 30 ? `数据更新于 ${minutesAgo} 分钟前` : ''

  return (
    <Card className="border-green-100 bg-gradient-to-r from-green-50/60 to-white">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-green-100">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-green-700" />
          <h2 className="text-sm font-semibold text-green-900">宏观快讯</h2>
          {isLoading && <Skeleton className="h-4 w-32" />}
        </div>
        <div className="flex items-center gap-2">
          {staleHint && (
            <span className="text-[11px] text-slate-400">{staleHint}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* 横向滚动内容 */}
      <div className="relative group">
        {canScrollLeft && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 bg-white/80 shadow opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
        {canScrollRight && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 bg-white/80 shadow opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="shrink-0 w-72 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))
            : isError
            ? (
                <div className="shrink-0 text-sm text-red-500 py-2">
                  加载失败，请点击刷新重试
                </div>
              )
            : news.map((item) => (
                <div
                  key={item.id}
                  className="shrink-0 w-72 p-2.5 rounded-lg border border-slate-100 bg-white hover:border-green-200 hover:shadow-sm transition-all cursor-pointer"
                >
                  {/* 时间 + 事件类型 */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-slate-400">
                      {timeAgo(item.pub_time)}
                    </span>
                    {item.event_type && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                        {EVENT_TYPE_LABELS[item.event_type] || item.event_type}
                      </Badge>
                    )}
                  </div>
                  {/* 标题 */}
                  <p className="text-xs text-slate-800 leading-snug line-clamp-2 font-medium">
                    {item.title}
                  </p>
                </div>
              ))}
        </div>
      </div>
    </Card>
  )
}
