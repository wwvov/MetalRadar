import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Star, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function EmptyGuide() {
  const navigate = useNavigate()

  return (
    <Card className="p-8 text-center bg-gradient-to-br from-emerald-50/80 to-white border-2 border-dashed border-emerald-200">
      <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <Star className="w-7 h-7 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">
        您还没有关注公司
      </h3>
      <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
        添加关注后可获得专属原材料风险新闻推送，
        系统将自动识别关联新闻并计算关联度。
      </p>
      <Button
        className="bg-emerald-600 hover:bg-emerald-700"
        onClick={() => navigate('/watchlist')}
      >
        立即添加
        <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    </Card>
  )
}
