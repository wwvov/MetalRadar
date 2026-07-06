// ECharts 通用配置 — 所有图表组件引用此文件

import type { EChartsOption } from 'echarts'

export const CHART_COLORS = {
  up: '#ef4444',    // 涨/红色
  down: '#22c55e',  // 跌/绿色
  blue: '#3b82f6',
  yellow: '#eab308',
  gray: '#6b7280',
  primary: '#166534',    // 深绿色主色 (Agent)
  green: '#16a34a',      // 翠绿
}

export const BASE_CHART_OPTION: Partial<EChartsOption> = {
  animation: true,
  animationDuration: 500,
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderColor: '#334155',
    textStyle: { color: '#e2e8f0', fontSize: 12 },
  },
  grid: {
    left: '3%',
    right: '3%',
    bottom: '3%',
    containLabel: true,
  },
}

// K线蜡烛图颜色配置
export const CANDLESTICK_STYLE = {
  itemStyle: {
    color: '#ef4444',        // 阳线红
    color0: '#22c55e',       // 阴线绿
    borderColor: '#ef4444',
    borderColor0: '#22c55e',
  },
}
