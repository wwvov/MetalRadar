import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GitGraph,
  Building2,
  AlertTriangle,
  Newspaper,
  TrendingUp,
  Factory,
} from "lucide-react";

import knowledgeGraphService, { type GraphData, type GraphNode, type GraphFilters } from "@/services/knowledgeGraphService";
import CompanySelector from "@/components/knowledge-graph/CompanySelector";
import GraphCanvas from "@/components/knowledge-graph/GraphCanvas";
import NodeDetailPanel from "@/components/knowledge-graph/NodeDetailPanel";
import { useWatchlist } from "@/providers/watchlist-context";
import { useFollows } from "@/hooks/useFollows";

export default function KnowledgeGraphPage() {
  const { follows } = useWatchlist();
  useFollows(); // 用来触发数据同步
  
  // 当前选中的公司
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  // 图谱筛选设置
  const [filters, setFilters] = useState<GraphFilters>({
    includeNews: true,
    includeMaterials: true,
    includeIndustries: true,
  });
  // 图谱数据（从后端获取）
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  // 当前点击的图谱节点
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const navigate = useNavigate();

  // 当关注公司变化时，默认选中所有关注公司
  useEffect(() => {
    if (follows.length > 0) {
      setSelectedCompanies(follows.map(c => c.id));
    }
  }, [follows.map(c => c.id).join(',')]);

  useEffect(() => {
    if (selectedCompanies.length === 0) {
      setGraphData(null);
      return;
    }

    async function loadGraph() {
      setLoading(true);
      try {
        const data = await knowledgeGraphService.getGraph(selectedCompanies, filters);
        setGraphData(data);
      } catch (error) {
        console.error("Failed to load knowledge graph:", error);
        setGraphData(null);
      } finally {
        setLoading(false);
      }
    }

    loadGraph();
  }, [selectedCompanies, filters]);

  const handleAgentAnalysis = () => {
    if (!selectedNode) return;

    navigate("/agent", {
      state: {
        graphNode: selectedNode,
      },
    });
  };

  const handleNavigateToCompany = (companyId: string) => {
    navigate(`/company/${companyId}`);
  };

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          知识图谱
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          宏观新闻、原材料、产业链与企业之间的动态关联分析
        </p>
      </div>

      {/* 顶部：公司选择 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-800">选择关注公司</h2>
          </div>
          <CompanySelector
            selectedIds={selectedCompanies}
            onChange={setSelectedCompanies}
          />
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitGraph className="w-5 h-5 text-purple-600" />
            <h2 className="font-semibold text-slate-800">节点类型筛选</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox 
                checked={filters.includeNews} 
                onCheckedChange={(checked) => 
                  setFilters(f => ({ ...f, includeNews: !!checked }))
                }
              />
              <Newspaper className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-slate-700">新闻节点</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox 
                checked={filters.includeMaterials} 
                onCheckedChange={(checked) => 
                  setFilters(f => ({ ...f, includeMaterials: !!checked }))
                }
              />
              <TrendingUp className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-slate-700">原材料节点</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox 
                checked={filters.includeIndustries} 
                onCheckedChange={(checked) => 
                  setFilters(f => ({ ...f, includeIndustries: !!checked }))
                }
              />
              <Factory className="w-4 h-4 text-green-600" />
              <span className="text-sm text-slate-700">产业链节点</span>
            </label>
          </div>
        </Card>
      </div>

      {/* 中间：知识图谱 + 节点详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：知识图谱 */}
        <Card className="p-5 h-[800px] flex flex-col lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <GitGraph className="w-5 h-5 text-purple-600" />
            <h2 className="font-semibold text-slate-800">动态知识图谱</h2>
            {selectedCompanies.length > 0 && (
              <span className="text-sm text-slate-500 ml-auto">
                已选择 {selectedCompanies.length} 家公司
              </span>
            )}
          </div>

          <div className="flex-1 rounded-lg border bg-slate-50 overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                <div className="space-y-3 w-64">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <p className="text-sm text-slate-500 text-center">正在生成知识图谱...</p>
                </div>
              </div>
            )}
            {graphData ? (
              <GraphCanvas
                graph={graphData}
                onNodeSelect={setSelectedNode}
              />
            ) : selectedCompanies.length > 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-center text-slate-500">
                <div>
                  <AlertTriangle className="mx-auto w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium">无法加载知识图谱</p>
                  <p className="text-sm mt-2">请检查后端服务是否正常运行</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-slate-500">
                <div>
                  <GitGraph className="mx-auto w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium">请在上方选择至少一个公司</p>
                  <p className="text-sm mt-2">系统将自动生成关联知识图谱</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* 右侧：节点详情 */}
        <NodeDetailPanel 
          node={selectedNode} 
          onAgentAnalysis={handleAgentAnalysis}
          graphData={graphData}
          onNavigateToCompany={handleNavigateToCompany}
        />
      </div>
    </div>
  );
}
