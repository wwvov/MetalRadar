import { Card } from '@/components/ui/card'
import { GitGraph } from 'lucide-react'

export default function KnowledgeGraphPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">知识图谱</h1>
      <p className="text-sm text-slate-500 mb-6">
        产业链知识图谱可视化 — 公司、原材料、期货品种之间的关系网络
      </p>

      <Card className="p-16 text-center border-dashed bg-slate-50/50">
        <div className="max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
            <GitGraph className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            知识图谱功能开发中
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            此功能将在后续版本中实现，届时您可以：
          </p>
          <ul className="text-sm text-slate-500 mt-3 space-y-1.5 text-left">
            <li>· 可视化浏览产业链上下游关系网络</li>
            <li>· 查看公司-原材料-期货合约的关联链路</li>
            <li>· 探索价格传导路径与供给需求影响链</li>
            <li>· 基于图算法识别关键节点与风险传播</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
