import { useState, useEffect, useRef } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus } from 'lucide-react'
import { useCompanySearch } from '@/hooks/useCompany'
import { useWatchlist } from '@/providers'
import { companyService } from '@/services/companyService'
import type { CompanyBasic } from '@/types/company'

export function AddCompanyDrawer() {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading, isFetching } = useCompanySearch(searchTerm)
  const { addFollow, isFollowed } = useWatchlist()

  // 实时搜索（300ms 防抖）
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    const trimmed = keyword.trim()
    if (trimmed.length >= 2) {
      debounceRef.current = setTimeout(() => {
        setSearchTerm(trimmed)
      }, 300)
    } else {
      setSearchTerm('')
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [keyword])

  const handleAddCompany = async (company: CompanyBasic) => {
    setAdding(company.id)
    try {
      await companyService.initCompany(company.id, reportFile || undefined)
      addFollow(company)
      setReportFile(null)
    } catch {
      // 即使画像生成失败，也添加关注
      addFollow(company)
    } finally {
      setAdding(null)
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          新增关注
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-6 pb-8">
          <DrawerHeader>
            <DrawerTitle>新增关注公司</DrawerTitle>
          </DrawerHeader>

          {/* 搜索栏 */}
          <div className="mb-4">
            <Input
              placeholder="输入公司名称或股票代码（如：赣锋锂业 或 002460）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
            {isFetching && (
              <p className="text-xs text-green-700 mt-1">搜索中...</p>
            )}
          </div>

          {/* 上传财报(可选) */}
          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-1 block">
              上传财报PDF（可选，用于AI生成精准画像）
            </label>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setReportFile(file)
              }}
              className="text-xs"
            />
            {reportFile && (
              <p className="text-xs text-green-700 mt-1">
                已选择: {reportFile.name}
              </p>
            )}
          </div>

          {/* 搜索结果 */}
          <div className="max-h-72 overflow-y-auto space-y-2">
            {keyword.trim().length < 2 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                请输入至少2个字符搜索A股上市公司
              </p>
            ) : isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : !data || data.companies.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                未找到匹配的A股上市公司
              </p>
            ) : (
              data.companies.map((company) => {
                const alreadyFollowing = isFollowed(company.id)
                return (
                  <div
                    key={company.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-green-50/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {company.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {company.id}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddCompany(company)}
                      disabled={adding === company.id || alreadyFollowing}
                      variant={alreadyFollowing ? 'secondary' : 'default'}
                      className={alreadyFollowing ? '' : 'bg-green-800 hover:bg-green-900'}
                    >
                      {alreadyFollowing ? '已关注' : adding === company.id ? '添加中...' : '关注'}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
