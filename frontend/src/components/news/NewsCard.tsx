import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Star,
  ChevronDown,
  Check,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@/types/news'
import { FavoritePopover } from './FavoritePopover'
import type { NewsItem } from '@/types/news'

interface NewsCardProps {
  news: NewsItem
  followedCompanyNames: Map<string, string>
  isMacroMode?: boolean
  onFavorite: (newsId: string, linkedCompanyId?: string | null) => void
  onMarkRead: (newsId: string) => void
  onTagClick: (type: 'company' | 'metal' | 'event', value: string) => void
}

const RELEVANCE_BORDERS: Record<string, string> = {
  red: 'border-l-rose-500 shadow-md shadow-rose-50',
  yellow: 'border-l-amber-500',
  blue: 'border-l-emerald-500',
  gray: 'border-l-gray-300',
}

const RELEVANCE_LABELS: Record<string, string> = {
  red: '最高相关',
  yellow: '中相关',
  blue: '高相关',
  gray: '低相关',
}

const RELEVANCE_LABEL_COLORS: Record<string, string> = {
  red: 'text-rose-600',
  yellow: 'text-amber-600',
  blue: 'text-emerald-600',
  gray: 'text-gray-400',
}

const EMOTION_LABELS: Record<string, string> = {
  positive: '利好', negative: '利空', neutral: '中性',
}
const EMOTION_COLORS: Record<string, string> = {
  positive: 'bg-rose-50 text-rose-600',
  negative: 'bg-green-50 text-green-600',
  neutral: 'bg-slate-50 text-slate-500',
}

export function NewsCard({
  news,
  followedCompanyNames,
  isMacroMode,
  onFavorite,
  onMarkRead,
  onTagClick,
}: NewsCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [favoriteOpen, setFavoriteOpen] = useState(false)
  // 已读状态完全来自 props，不使用本地状态
  const isRead = news.is_read || false

  const relevance = news.relevance_level || 'gray'
  const companyEntities = news.company_entities || []
  const metalEntities = news.metal_entities || []

  // 推荐的关联公司
  const suggestedCompanies = companyEntities
    .filter((code) => followedCompanyNames.has(code))
    .map((code) => ({ code, name: followedCompanyNames.get(code)! }))

  const handleCardClick = () => {
    if (!expanded && !isRead) {
      onMarkRead(news.id)
    }
    setExpanded(!expanded)
  }

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (news.is_favorited) {
      onFavorite(news.id, null)
    } else {
      setFavoriteOpen(true)
    }
  }

  const handleConfirmFavorite = (companyId: string | null) => {
    onFavorite(news.id, companyId)
    setFavoriteOpen(false)
  }

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isRead) {
      onMarkRead(news.id)
    }
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all cursor-pointer',
        'border-l-[3px]',
        RELEVANCE_BORDERS[relevance] || 'border-l-gray-300',
        isRead && 'opacity-75',
        'hover:border-l-opacity-100'
      )}
      onClick={handleCardClick}
    >
      <div className="p-3.5 pl-4">
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
            )}
            <h3 className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 hover:text-emerald-700 transition-colors">
              {news.title}
            </h3>
          </div>
          <span className="text-[11px] tabular-nums text-slate-400 whitespace-nowrap pt-0.5">
            {news.pub_time
              ? (() => {
                  const d = new Date(news.pub_time)
                  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                })()
              : ''}
          </span>
        </div>

        {/* 摘要行 */}
        <p className="text-[12px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
          {(news.summary || '').slice(0, 80)}{(news.summary || '').length > 80 ? '...' : ''}
          {news.source && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              来源:{news.source}
            </span>
          )}
        </p>

        {/* 实体标签行 */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {/* 公司标签（宏观模式隐藏） */}
          {!isMacroMode &&
            companyEntities.map((code) => {
              const name = followedCompanyNames.get(code) || code
              return (
                <Badge
                  key={`c-${code}`}
                  variant="secondary"
                  className="text-[10px] py-0 px-1.5 cursor-pointer bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTagClick('company', code)
                  }}
                >
                  {name.length > 6 ? name.slice(0, 6) + '…' : name}
                </Badge>
              )
            })}

          {/* 金属标签（宏观模式隐藏） */}
          {!isMacroMode &&
            metalEntities.map((metal) => (
              <Badge
                key={`m-${metal}`}
                variant="secondary"
                className="text-[10px] py-0 px-1.5 cursor-pointer bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick('metal', metal)
                }}
              >
                {metal}
              </Badge>
            ))}

          {/* 事件类型标签 */}
          {news.event_type && (
            <Badge
              variant="secondary"
              className="text-[10px] py-0 px-1.5 cursor-pointer bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border-0"
              onClick={(e) => {
                e.stopPropagation()
                onTagClick('event', news.event_type)
              }}
            >
              {EVENT_TYPE_LABELS[news.event_type] || news.event_type}
            </Badge>
          )}

          {/* 情绪标签 */}
          {news.emotion && (
            <Badge
              variant="secondary"
              className={`text-[10px] py-0 px-1.5 border-0 ${EMOTION_COLORS[news.emotion] || 'bg-slate-50 text-slate-500'}`}
            >
              {EMOTION_LABELS[news.emotion] || news.emotion}
            </Badge>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1">
            {/* 收藏 */}
            <FavoritePopover
              open={favoriteOpen}
              onOpenChange={setFavoriteOpen}
              isFavorited={news.is_favorited || false}
              suggestedCompanies={suggestedCompanies}
              onConfirm={handleConfirmFavorite}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[12px] text-slate-500 hover:text-amber-500"
                onClick={handleFavoriteClick}
              >
                <Star
                  className={cn(
                    'w-3.5 h-3.5',
                    news.is_favorited
                      ? 'fill-amber-400 text-amber-400'
                      : ''
                  )}
                />
                {news.is_favorited ? '已收藏' : '收藏'}
              </Button>
            </FavoritePopover>

            {/* 设为已读 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[12px] text-slate-500"
              onClick={handleMarkRead}
              disabled={isRead}
            >
              <Check className="w-3.5 h-3.5" />
              {isRead ? '已读' : '设为已读'}
            </Button>

            {/* 展开 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[12px] text-slate-500"
              onClick={(e) => {
                e.stopPropagation()
                handleCardClick()
              }}
            >
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform',
                  expanded && 'rotate-180'
                )}
              />
              {expanded ? '收起' : '展开'}
            </Button>
          </div>

          {/* 右侧关联度文字 */}
          <span
            className={cn(
              'flex items-center gap-1 text-[11px] font-medium',
              RELEVANCE_LABEL_COLORS[relevance]
            )}
          >
            <Sparkles className="w-3 h-3" />
            {RELEVANCE_LABELS[relevance]}
          </span>
        </div>

        {/* 展开详情面板 */}
        {expanded && (
          <div
            className="mt-3 pt-3 border-t bg-slate-50 -mx-3.5 -mb-3.5 px-3.5 pb-3 rounded-b-lg animate-in slide-in-from-top-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
              {news.summary || '暂无详细内容'}
            </p>
            {/* 关联公司建议 */}
            {suggestedCompanies.length > 0 && (
              <div className="mt-2.5 p-2.5 bg-emerald-50/50 rounded-lg">
                <p className="text-[11px] font-medium text-emerald-800 mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  关联公司建议
                </p>
                <div className="flex flex-wrap gap-1">
                  {suggestedCompanies.map(({ code, name }) => (
                    <Badge
                      key={code}
                      variant="secondary"
                      className="text-[10px] bg-emerald-100 text-emerald-700"
                    >
                      {name} ({code})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
