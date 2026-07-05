import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface MermaidDiagramProps {
  chart: string
  className?: string
}

export function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!chart || !chart.trim()) {
      setLoading(false)
      return
    }

    let cancelled = false

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          themeVariables: {
            primaryColor: '#dcfce7',
            primaryBorderColor: '#22c55e',
            primaryTextColor: '#1e293b',
            lineColor: '#94a3b8',
            secondaryColor: '#fef3c7',
            tertiaryColor: '#dbeafe',
          },
        })

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const { svg: renderedSvg } = await mermaid.render(id, chart)

        if (!cancelled) {
          setSvg(renderedSvg)
          setLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Mermaid 渲染失败')
          setLoading(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart])

  if (loading) {
    return <Skeleton className="h-48 w-full rounded-lg" />
  }

  if (error || !svg) {
    return (
      <div className="text-xs text-slate-400 p-4 bg-slate-50 rounded-lg text-center">
        {error || '暂无产业链关系图'}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`flex justify-center overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
