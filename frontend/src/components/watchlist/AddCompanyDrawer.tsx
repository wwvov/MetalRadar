import { useState, useEffect, useRef } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Plus,
  Search,
  Check,
  Upload,
  SkipForward,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Building2,
  FileText,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCompanySearch } from '@/hooks/useCompany'
import { useWatchlist } from '@/providers'
import { useFollows } from '@/hooks/useFollows'
import { companyService } from '@/services/companyService'
import { useQueryClient } from '@tanstack/react-query'
import type { CompanyBasic, CompanyDetail } from '@/types/company'

type WizardStep = 1 | 2 | 3 | 4

const STEP_LABELS: Record<WizardStep, string> = {
  1: '搜索公司',
  2: '上传财报',
  3: 'AI 生成画像',
  4: '确认保存',
}

export function AddCompanyDrawer() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<WizardStep>(1)

  // Step 1: 搜索
  const [keyword, setKeyword] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<CompanyBasic | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: searchData, isLoading: searching, isFetching } = useCompanySearch(searchTerm)
  const { addFollow, isFollowed } = useWatchlist()
  const { followMutation } = useFollows()

  // Step 2: 上传财报
  const [reportFile, setReportFile] = useState<File | null>(null)

  // Step 3: AI 处理
  const [processingStep, setProcessingStep] = useState('')
  const [processingError, setProcessingError] = useState('')

  // Step 4: 确认画像
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null)

  // 实时搜索防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = keyword.trim()
    if (trimmed.length >= 2) {
      debounceRef.current = setTimeout(() => setSearchTerm(trimmed), 300)
    } else {
      setSearchTerm('')
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [keyword])

  // 关闭时重置
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setStep(1)
      setKeyword('')
      setSearchTerm('')
      setSelectedCompany(null)
      setReportFile(null)
      setProcessingStep('')
      setProcessingError('')
      setCompanyDetail(null)
    }
    setOpen(newOpen)
  }

  // Step 1 → 2
  const handleConfirmCompany = () => {
    if (selectedCompany) {
      setStep(2)
    }
  }

  // Step 2 → 3 (开始 AI 处理)
  const handleStartProcessing = async () => {
    if (!selectedCompany) return
    setStep(3)
    setProcessingStep('正在调用AI大模型分析公司产业链...')
    setProcessingError('')

    try {
      // 直接调用 API — 后端会完成 LLM 调用（可能需要数秒）
      const detail = await companyService.initCompany(
        selectedCompany.id,
        reportFile || undefined,
        selectedCompany.name
      )
      setCompanyDetail(detail)
      setStep(4)
    } catch (err: any) {
      // 提取API返回的详细错误信息
      const detail = err?.response?.data?.detail
      const message = detail
        || (err instanceof Error ? err.message : '')
        || '画像生成失败，请检查网络连接后重试'
      setProcessingError(message)
    }
  }

  // Step 4 → 完成
  const handleSave = async () => {
    if (!selectedCompany) return

    try {
      // 持久化关注到后端
      await followMutation.mutateAsync(selectedCompany.id)
      // 更新本地 context
      addFollow(selectedCompany)
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['user-follows'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['company-detail', selectedCompany.id] })
      handleOpenChange(false)
    } catch {
      // 即使 API 失败，也更新本地状态
      addFollow(selectedCompany)
      handleOpenChange(false)
    }
  }

  // 渲染步骤指示器
  const renderSteps = () => (
    <div className="flex items-center gap-1 mb-6">
      {([1, 2, 3, 4] as WizardStep[]).map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-all',
              step === s && 'bg-emerald-600 text-white',
              step > s && 'bg-emerald-100 text-emerald-700',
              step < s && 'bg-slate-100 text-slate-400'
            )}
          >
            {step > s ? <Check className="w-3 h-3" /> : s}
          </div>
          <span
            className={cn(
              'text-[11px] hidden sm:inline',
              step === s ? 'text-emerald-700 font-medium' : 'text-slate-400'
            )}
          >
            {STEP_LABELS[s]}
          </span>
          {i < 3 && (
            <div
              className={cn(
                'w-6 sm:w-8 h-0.5 rounded',
                step > s ? 'bg-emerald-200' : 'bg-slate-200'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          新增关注
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-xl px-6 pb-8">
          <DrawerHeader>
            <DrawerTitle>新增关注公司</DrawerTitle>
            <DrawerDescription>
              搜索A股公司，AI将自动分析其产业链画像
            </DrawerDescription>
          </DrawerHeader>

          {renderSteps()}

          {/* ===== Step 1: 搜索公司 ===== */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Input
                  placeholder="输入公司名称或股票代码（如：宁德时代 或 300750）"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  autoFocus
                  className="h-10"
                />
                {isFetching && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    搜索中...
                  </p>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {keyword.trim().length < 2 ? (
                  <div className="text-center py-10">
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      请输入至少2个字符搜索A股上市公司
                    </p>
                  </div>
                ) : searching ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))
                ) : !searchData || searchData.companies.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-8">
                    未找到匹配的A股上市公司
                  </p>
                ) : (
                  searchData.companies.map((company) => {
                    const alreadyFollowing = isFollowed(company.id)
                    return (
                      <div
                        key={company.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer',
                          selectedCompany?.id === company.id
                            ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                            : alreadyFollowing
                              ? 'border-slate-100 bg-slate-50 opacity-60'
                              : 'border-slate-200 hover:border-emerald-300 hover:bg-green-50/50'
                        )}
                        onClick={() => {
                          if (!alreadyFollowing) setSelectedCompany(company)
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {company.name}
                            </p>
                            <p className="text-xs text-slate-500 font-mono">
                              {company.id}
                              {company.industry && (
                                <span className="text-slate-400 ml-1.5">· {company.industry}</span>
                              )}
                            </p>
                            {company.business_desc && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">
                                {company.business_desc}
                              </p>
                            )}
                          </div>
                        </div>
                        {alreadyFollowing ? (
                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500">
                            已关注
                          </Badge>
                        ) : selectedCompany?.id === company.id ? (
                          <Badge className="text-[10px] bg-emerald-600 text-white">
                            已选择
                          </Badge>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600">
                            选择
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleConfirmCompany}
                  disabled={!selectedCompany}
                  className="bg-emerald-700 hover:bg-emerald-800"
                >
                  确认选择
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ===== Step 2: 上传财报 ===== */}
          {step === 2 && selectedCompany && (
            <div className="space-y-4">
              <div className="bg-emerald-50 rounded-lg p-4 flex items-start gap-3">
                <Building2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">{selectedCompany.name}</p>
                  <p className="text-xs text-emerald-700 font-mono">
                    {selectedCompany.id}
                    {selectedCompany.industry && (
                      <span className="text-emerald-600 ml-1.5">· {selectedCompany.industry}</span>
                    )}
                  </p>
                  {selectedCompany.business_desc && (
                    <p className="text-xs text-emerald-700 mt-0.5 line-clamp-2">{selectedCompany.business_desc}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-slate-800 mb-1">上传财报（可选）</p>
                <p className="text-xs text-slate-500 mb-3">
                  上传公司最新的年报/半年报PDF，AI将提取成本结构数据，生成更精准的画像。
                  不上传财报也可继续，画像将基于行业经验推断。
                </p>

                <div
                  className={cn(
                    'border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer',
                    reportFile
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-slate-300 hover:border-emerald-400 hover:bg-green-50/30'
                  )}
                  onClick={() => document.getElementById('report-upload')?.click()}
                >
                  <Input
                    id="report-upload"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                  />
                  {reportFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm text-emerald-700 font-medium">{reportFile.name}</span>
                      <span className="text-xs text-emerald-500">
                        ({(reportFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">拖拽文件到此处或点击选择</p>
                      <p className="text-xs text-slate-400 mt-1">支持 PDF 格式</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  上一步
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleStartProcessing}>
                    <SkipForward className="w-4 h-4 mr-1" />
                    跳过，开始生成
                  </Button>
                  <Button
                    onClick={handleStartProcessing}
                    className="bg-emerald-700 hover:bg-emerald-800"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    开始生成画像
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ===== Step 3: AI 处理中 ===== */}
          {step === 3 && selectedCompany && (
            <div className="space-y-4">
              <div className="text-center py-8">
                {processingError ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-red-700 mb-1">画像生成失败</p>
                      <p className="text-sm text-red-500">{processingError}</p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" onClick={() => setStep(2)}>
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回上一步
                      </Button>
                      <Button onClick={handleStartProcessing}>
                        <RotateCcw className="w-4 h-4 mr-1" />
                        重试
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto w-7 h-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-800 mb-1">
                        正在生成 {selectedCompany.name} 的AI画像
                      </p>
                      <p className="text-sm text-emerald-600 flex items-center justify-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {processingStep}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">请稍候，AI 大模型正在分析中...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== Step 4: 确认保存 ===== */}
          {step === 4 && companyDetail && selectedCompany && (
            <div className="space-y-4">
              <div className="bg-emerald-50 rounded-lg p-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-600" />
                <span className="text-sm text-emerald-800 font-medium">AI画像已生成</span>
              </div>

              {/* 画像摘要 */}
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">公司</p>
                    <p className="font-semibold text-slate-800">{companyDetail.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">行业</p>
                    <p className="font-medium text-slate-700">{companyDetail.industry || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">产业链位置</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        companyDetail.portrait.position === 'up' && 'bg-blue-100 text-blue-700',
                        companyDetail.portrait.position === 'mid' && 'bg-yellow-100 text-yellow-700',
                        companyDetail.portrait.position === 'down' && 'bg-green-100 text-green-700',
                      )}
                    >
                      {{ up: '上游', mid: '中游', down: '下游' }[companyDetail.portrait.position] || companyDetail.portrait.position}
                      {companyDetail.portrait.position_detail && ` · ${companyDetail.portrait.position_detail}`}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">敏感品种</p>
                    <p className="font-medium text-slate-700">
                      {companyDetail.portrait.materials.length} 个品种
                    </p>
                  </div>
                </div>

                {companyDetail.business_desc && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">主营业务</p>
                    <p className="text-sm text-slate-600">{companyDetail.business_desc}</p>
                  </div>
                )}

                {companyDetail.portrait.materials.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">识别到的敏感品种</p>
                    <div className="flex flex-wrap gap-1">
                      {companyDetail.portrait.materials.map((m, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100"
                        >
                          {m.material_name}
                          {m.cost_pct != null && ` ${m.cost_pct}%`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400">
                确认保存后，您可以在「我的关注」页面随时编辑修改AI生成的画像数据
              </p>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  重新上传财报
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-emerald-700 hover:bg-emerald-800"
                >
                  <Check className="w-4 h-4 mr-1" />
                  确认保存关注
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

