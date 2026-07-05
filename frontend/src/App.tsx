import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryProvider } from '@/providers/query-provider'
import { WatchlistProvider } from '@/providers/watchlist-context'
import { Layout } from '@/components/Layout'
import HomePage from '@/pages/HomePage'
import WatchlistPage from '@/pages/WatchlistPage'
import CompanyPage from '@/pages/CompanyPage'
import AgentPage from '@/pages/AgentPage'
import KnowledgeGraphPage from '@/pages/KnowledgeGraphPage'

export default function App() {
  return (
    <QueryProvider>
      <TooltipProvider>
        <WatchlistProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/company" element={<CompanyPage />} />
                <Route path="/company/:id" element={<CompanyPage />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WatchlistProvider>
      </TooltipProvider>
    </QueryProvider>
  )
}
