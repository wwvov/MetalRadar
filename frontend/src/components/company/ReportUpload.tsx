import { useState, useCallback, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { companyService } from '@/services/companyService'
import { Upload, FileText, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReportUploadProps {
  companyId: string
  hasExistingReport: boolean
  existingFileName?: string
  existingReportTime?: string
}

export function ReportUpload({
  companyId,
  hasExistingReport,
  existingFileName,
  existingReportTime,
}: ReportUploadProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.pdf')) {
        setError('仅支持PDF格式文件')
        return
      }
      if (file.size > 25 * 1024 * 1024) {
        setError('文件大小不能超过25MB')
        return
      }

      setUploading(true)
      setError('')
      setSuccess(false)

      try {
        await companyService.uploadReport(companyId, file)
        setSuccess(true)
        // 刷新相关查询缓存
        queryClient.invalidateQueries({ queryKey: ['company-detail', companyId] })
        queryClient.invalidateQueries({ queryKey: ['company-financials', companyId] })
        queryClient.invalidateQueries({ queryKey: ['cost-pressure', companyId] })
      } catch (err: any) {
        const detail = err?.response?.data?.detail
        setError(detail || err?.message || '上传失败，请检查网络连接')
      } finally {
        setUploading(false)
      }
    },
    [companyId, queryClient]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  return (
    <Card className="p-5">
      {/* 标题栏 + 折叠切换 */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-600" />
          财报上传
          {hasExistingReport && (
            <span className="text-[10px] font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              已有财报
            </span>
          )}
        </h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <span className={cn(
            'text-xs text-slate-400 transition-transform',
            !collapsed && 'rotate-180'
          )}>
            ▼
          </span>
        </Button>
      </div>

      {/* 折叠内容 */}
      {!collapsed && (
        <div className="mt-4">
          {/* 已有财报信息 */}
          {hasExistingReport && (
            <div className="mb-4 p-3 bg-emerald-50 rounded-lg flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-emerald-700">
                  {existingFileName || '财报已上传'}
                </p>
                {existingReportTime && (
                  <p className="text-emerald-600 mt-0.5">
                    提取时间：{new Date(existingReportTime).toLocaleString('zh-CN')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 上传区域 */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
              dragOver
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
            )}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="py-4">
                <div className="relative w-10 h-10 mx-auto mb-3">
                  <div className="absolute inset-0 rounded-full border-3 border-blue-100" />
                  <div className="absolute inset-0 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" />
                  <Loader2 className="absolute inset-0 m-auto w-5 h-5 text-blue-600 animate-spin" />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">正在分析财报...</p>
                <p className="text-xs text-slate-400">AI 正在提取财务数据（可能需要1-2分钟），请耐心等待</p>
              </div>
            ) : success ? (
              <div className="py-4">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-700 mb-1">上传成功</p>
                <p className="text-xs text-slate-500 mb-3">财务数据已自动提取并更新</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setSuccess(false)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  重新上传
                </Button>
              </div>
            ) : error ? (
              <div className="py-4">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-600 mb-2">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setError('')}
                >
                  重试
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-1">
                  拖拽PDF文件到此处，或点击上传
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  支持标准财报PDF，AI将自动提取财务数据
                </p>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  选择文件
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file)
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {/* 说明 */}
          <p className="text-[10px] text-slate-400 mt-2">
            上传财报后，系统将自动提取关键财务指标并更新成本压力仪表。
            若文件为扫描件/图片PDF，AI可能无法正确提取文本。
          </p>
        </div>
      )}
    </Card>
  )
}
