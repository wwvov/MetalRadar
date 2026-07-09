import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/news'

interface MacroTickerProps {
  news: NewsItem[]
  isLoading: boolean
  lastRefreshed: Date | null
  onRefresh: () => void
  refreshCooldown: boolean
}

export function MacroTicker({ news, isLoading, lastRefreshed, onRefresh, refreshCooldown }: MacroTickerProps) {
  const [paused, setPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const minutesAgo = lastRefreshed ? Math.floor((Date.now() - lastRefreshed.getTime()) / 60000) : 0

  const titles = news.map((n) => n.title)

  return (
    <div className="rounded-lg overflow-hidden shadow-sm">
      {/* 三色渐变顶线 */}
      <div className="h-[1px] bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" />

      {/* 主体 */}
      <div className="flex items-stretch h-10 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        {/* 左侧 LIVE 标识 */}
        <div className="flex items-center gap-2 px-3 border-r border-white/10 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <Radio className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] tracking-wider text-slate-300 uppercase font-medium">
            宏观快讯
          </span>
        </div>

        {/* 中部滚动区 */}
        <div
          className="flex-1 overflow-hidden relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* 左右渐隐遮罩 */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-800 to-transparent z-10 pointer-events-none" />

          <div className="flex items-center h-full overflow-hidden">
            <div
              ref={scrollRef}
              className={cn(
                'flex items-center gap-0 whitespace-nowrap',
                paused ? 'animate-none' : 'animate-marquee'
              )}
              style={{
                animationDuration: paused ? undefined : '120s',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
              }}
            >
              {isLoading ? (
                <span className="text-[13px] text-slate-400 px-4">
                  正在获取最新资讯…
                </span>
              ) : titles.length === 0 ? (
                <span className="text-[13px] text-slate-400 px-4">
                  暂无宏观快讯
                </span>
              ) : (
                titles.map((title, i) => (
                  <span key={i} className="flex items-center">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mx-2 shrink-0" />
                    <span className="text-[13px] text-slate-200">{title}</span>
                  </span>
                ))
              )}
              {/* 重复一遍确保无缝滚动 */}
              {!isLoading &&
                titles.map((title, i) => (
                  <span key={`dup-${i}`} className="flex items-center">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mx-2 shrink-0" />
                    <span className="text-[13px] text-slate-200">{title}</span>
                  </span>
                ))}
            </div>
          </div>
        </div>

        {/* 右侧刷新 */}
        <div className="flex items-center gap-2 px-3 border-l border-white/10 shrink-0">
          {minutesAgo > 30 && (
            <span className="text-[11px] text-slate-500 hidden md:inline">
              {minutesAgo} 分钟前更新
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-slate-300 hover:text-white hover:bg-white/10 bg-emerald-500/20"
            onClick={onRefresh}
            disabled={refreshCooldown}
          >
            <RefreshCw className={cn('w-3 h-3 mr-1', isLoading && 'animate-spin')} />
            {refreshCooldown ? (
              <span className="hidden sm:inline">正在刷新…</span>
            ) : (
              <span>
                <span className="hidden sm:inline">刷新资讯</span>
                <span className="sm:hidden">刷新</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
