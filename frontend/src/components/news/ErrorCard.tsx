import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorCardProps {
  message?: string
  onRetry: () => void
}

export function ErrorCard({ message = '数据加载失败，请重试', onRetry }: ErrorCardProps) {
  return (
    <Card className="p-8 text-center">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
      <p className="text-sm text-slate-600 mb-4">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-1.5" />
        重新加载
      </Button>
    </Card>
  )
}
