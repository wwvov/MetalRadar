import { useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Star } from 'lucide-react'

interface CompanySuggestion {
  code: string
  name: string
}

interface FavoritePopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isFavorited: boolean
  suggestedCompanies: CompanySuggestion[]
  onConfirm: (linkedCompanyId: string | null) => void
  children: ReactNode
}

export function FavoritePopover({
  open,
  onOpenChange,
  suggestedCompanies,
  onConfirm,
  children,
}: FavoritePopoverProps) {
  const [checkedCompanies, setCheckedCompanies] = useState<Set<string>>(
    () => new Set(suggestedCompanies.map((c) => c.code))
  )

  // 重置勾选状态
  const handleOpen = (o: boolean) => {
    if (o) {
      setCheckedCompanies(new Set(suggestedCompanies.map((c) => c.code)))
    }
    onOpenChange(o)
  }

  const toggleCompany = (code: string) => {
    setCheckedCompanies((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              收藏并关联到关注公司
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              系统自动匹配到以下相关公司，确认关联后可在该公司下查看此新闻。
            </p>

            {suggestedCompanies.length === 0 ? (
              <p className="text-sm text-slate-400">
                未匹配到已关注公司，可直接收藏。
              </p>
            ) : (
              <div className="space-y-2">
                {suggestedCompanies.map(({ code, name }) => (
                  <label
                    key={code}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={checkedCompanies.has(code)}
                      onCheckedChange={() => toggleCompany(code)}
                    />
                    <span className="text-sm">
                      {name}
                      <span className="text-xs text-slate-400 ml-1.5">{code}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfirm(null)}
              >
                仅收藏
              </Button>
              <Button
                size="sm"
                className="bg-green-800 hover:bg-green-900"
                onClick={() => {
                  // 传第一个勾选的公司
                  const first = [...checkedCompanies][0] || null
                  onConfirm(first)
                }}
              >
                确认关联并收藏
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
