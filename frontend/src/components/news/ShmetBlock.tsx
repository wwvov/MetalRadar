import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Factory } from 'lucide-react'
import { useNews } from '@/hooks/useNews'
import { useWatchlist } from '@/providers'
import { newsService } from '@/services/newsService'
import { NewsCard } from './NewsCard'
import { NewsSkeleton } from './NewsSkeleton'
import { ErrorCard } from './ErrorCard'

// 上海金属网品类 Tab（全品种覆盖）
const SHMET_TABS = [
  { value: '', label: '要闻' },
  { value: '铜', label: '铜' },
  { value: '铝', label: '铝' },
  { value: '铅', label: '铅' },
  { value: '锌', label: '锌' },
  { value: '镍', label: '镍' },
  { value: '锡', label: '锡' },
  { value: '贵金属', label: '贵金属' },
  { value: '小金属', label: '小金属' },
  { value: '铁矿石', label: '铁矿石' },
  { value: '螺纹钢', label: '螺纹钢' },
  { value: '热卷', label: '热卷' },
  { value: '不锈钢', label: '不锈钢' },
  { value: '原油', label: '原油' },
  { value: '纯碱', label: '纯碱' },
]

export function ShmetBlock() {
  const [metalTab, setMetalTab] = useState('')
  const { follows } = useWatchlist()

  const isCategory = metalTab === '贵金属' || metalTab === '小金属'
  const query = useNews('shmet_block', {
    ...(metalTab
      ? isCategory
        ? { metal_category: metalTab }
        : { metal: metalTab }
      : {}),
  })

  const handleFavorite = async (newsId: string, linkedCompanyId?: string | null) => {
    try {
      await newsService.favoriteNews(newsId, linkedCompanyId)
      query.refetch()
    } catch { /* pass */ }
  }

  return (
    <Card className="border-green-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-green-900">
          <Factory className="w-5 h-5 text-green-700" />
          上海金属网 · 产业快讯
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={metalTab} onValueChange={setMetalTab} className="flex-col">
          <TabsList className="w-full justify-start overflow-x-auto bg-green-50/50 p-1 rounded-lg">
            {SHMET_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-xs px-2.5 py-1.5 shrink-0 data-[state=active]:bg-green-800 data-[state=active]:text-white"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={metalTab} className="mt-3">
            {query.isLoading ? (
              <NewsSkeleton />
            ) : query.isError ? (
              <ErrorCard onRetry={() => query.refetch()} />
            ) : !query.data || query.data.news.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                暂无{metalTab || '要闻'}相关新闻
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                {query.data.news.map((item) => (
                  <NewsCard
                    key={item.id}
                    news={item}
                    onFavorite={handleFavorite}
                    onMarkRead={async () => {}}
                    onTagClick={() => {}}
                    followedCompanyNames={new Map(follows.map((c) => [c.id, c.name]))}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
