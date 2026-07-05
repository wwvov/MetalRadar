import { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GitBranch } from 'lucide-react'
import { BASE_CHART_OPTION } from '@/utils/echarts-config'
import type { FinancialData } from '@/types/company'

interface SankeyChartProps {
  financialData: FinancialData | undefined
  materialNames: string[]
  isLoading: boolean
}

export function SankeyChart({ financialData, materialNames, isLoading }: SankeyChartProps) {
  const option = useMemo(() => {
    const data = financialData
    if (!data || data.source === 'none') return null

    const directMaterial = data.direct_material_pct || 65
    const directLabor = data.direct_labor_pct || 10
    const manufacturing = data.manufacturing_pct || 25

    // 如果没有详细数据但有成本构成，生成基本桑基图
    const hasDetail = data.direct_material_pct != null || data.direct_labor_pct != null || data.manufacturing_pct != null
    if (!hasDetail) return null

    const nodes = [
      { name: '营业成本' },
      { name: '直接材料' },
      { name: '直接人工' },
      { name: '制造费用' },
    ]

    // 如果有具体品种，添加材料细分节点
    if (materialNames.length > 0 && data.direct_material_pct != null) {
      materialNames.slice(0, 5).forEach((name) => {
        nodes.push({ name })
      })
      if (materialNames.length > 5) {
        nodes.push({ name: '其他材料' })
      }
    }

    const links = []
    const totalCost = 100 // 归一化

    if (materialNames.length > 0 && data.direct_material_pct != null) {
      // 有材料细分
      const materialTotal = directMaterial
      const perMaterial = materialTotal / Math.min(materialNames.length, 6)
      const displayNames = materialNames.slice(0, 5)
      displayNames.forEach((name) => {
        links.push({ source: '直接材料', target: name, value: perMaterial })
      })
      if (materialNames.length > 5) {
        links.push({ source: '直接材料', target: '其他材料', value: perMaterial })
      }
      links.push({ source: '营业成本', target: '直接材料', value: materialTotal })
    } else {
      links.push({ source: '营业成本', target: '直接材料', value: directMaterial })
    }

    links.push({ source: '营业成本', target: '直接人工', value: directLabor })
    links.push({ source: '营业成本', target: '制造费用', value: manufacturing })

    return {
      ...BASE_CHART_OPTION,
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'left',
          data: nodes,
          links,
          label: {
            fontSize: 11,
            color: '#475569',
          },
          lineStyle: {
            color: 'gradient',
            curveness: 0.5,
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: '#e2e8f0',
          },
        },
      ],
    }
  }, [financialData, materialNames])

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40 mb-3" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </Card>
    )
  }

  if (!option) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-indigo-600" />
          营业成本结构桑基图
        </h3>
        <p className="text-xs text-slate-400 text-center py-10">
          上传财报后生成成本结构桑基图
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-indigo-600" />
        营业成本结构桑基图
      </h3>
      <ReactEChartsCore
        option={option}
        style={{ height: '350px' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'canvas' }}
      />
    </Card>
  )
}
