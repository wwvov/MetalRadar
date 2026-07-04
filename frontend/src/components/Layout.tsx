import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Newspaper,
  Star,
  Building2,
  Bot,
  Radar,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: '新闻资讯', icon: Newspaper },
  { to: '/watchlist', label: '我的关注', icon: Star },
  { to: '/company', label: '公司详情', icon: Building2 },
  { to: '/agent', label: 'AI Agent', icon: Bot },
]

export function Layout() {
  return (
    <div className="flex h-screen bg-green-50/30">
      {/* 左侧导航 — 白色背景 + 深绿色强调 */}
      <aside className="w-56 bg-white flex flex-col shrink-0 border-r border-slate-200 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center">
            <Radar className="w-5 h-5 text-green-200" />
          </div>
          <span className="text-green-900 font-bold text-lg tracking-tight">MetalRadar</span>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-green-800 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-green-50 hover:text-green-800'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 底部信息 */}
        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">MetalRadar v0.1.0</p>
        </div>
      </aside>

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-auto bg-white">
        <Outlet />
      </main>
    </div>
  )
}
