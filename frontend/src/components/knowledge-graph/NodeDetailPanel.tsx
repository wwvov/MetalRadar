import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Newspaper,
  Package,
  Network,
  Info,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Bot,
  MapPin,
  DollarSign,
  Calendar,
  Globe,
  Activity,
  Layers,
  Link2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  BarChart3,
  Factory,
  Briefcase,
  Sparkles,
} from "lucide-react";
import type { GraphNode, GraphData } from "@/services/knowledgeGraphService";

interface Props {
  node: GraphNode | null;
  onAgentAnalysis?: () => void;
  graphData?: GraphData | null;
  onNavigateToCompany?: (companyId: string) => void;
}

// 风险等级徽章
const RiskBadge = ({ level }: { level?: string }) => {
  if (!level) return null;
  
  const config: Record<string, { label: string; color: string; icon: any }> = {
    low: { label: "低风险", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
    medium: { label: "中风险", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
    high: { label: "高风险", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  };
  
  const cfg = config[level];
  if (!cfg) return null;
  
  const Icon = cfg.icon;
  
  return (
    <Badge className={`flex items-center gap-1.5 px-3 py-1.5 ${cfg.color} border`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </Badge>
  );
};

// 情绪分析徽章
const EmotionBadge = ({ emotion }: { emotion?: string }) => {
  if (!emotion) return null;
  
  const config: Record<string, { label: string; color: string; icon: any }> = {
    positive: { label: "积极", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: TrendingUp },
    negative: { label: "消极", color: "bg-red-100 text-red-700 border-red-200", icon: TrendingDown },
    neutral: { label: "中性", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Minus },
  };
  
  const cfg = config[emotion] || config.neutral;
  const Icon = cfg.icon;
  
  return (
    <Badge className={`flex items-center gap-1.5 px-2.5 py-1 ${cfg.color} border`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </Badge>
  );
};

// 节点类型徽章
const TypeBadge = ({ type }: { type: string }) => {
  const config: Record<string, { label: string; color: string; icon: any }> = {
    news: { label: "新闻事件", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Newspaper },
    material: { label: "原材料", color: "bg-orange-100 text-orange-700 border-orange-200", icon: Package },
    industry: { label: "产业链", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Factory },
    company: { label: "企业", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Building2 },
  };
  
  const cfg = config[type] || { label: type, color: "bg-slate-100 text-slate-700 border-slate-200", icon: Info };
  const Icon = cfg.icon;
  
  return (
    <Badge className={`flex items-center gap-1.5 px-3 py-1.5 ${cfg.color} border`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </Badge>
  );
};

// 统计卡片
const StatCard = ({ icon: Icon, label, value, color = "text-slate-700", bgColor = "bg-slate-50", hint }: any) => (
  <div className={`${bgColor} rounded-xl p-4 border border-slate-200`}>
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("700", "100")}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  </div>
);

// 属性项
const PropertyItem = ({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) => (
  <div className="flex items-start gap-3 py-2">
    {Icon && <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />}
    <div className="flex-1">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  </div>
);

// 价格图表（简单的可视化）
const PriceChart = ({ history }: { history?: Array<{ date: string; close: number }> }) => {
  if (!history || history.length === 0) return null;
  
  // 简单的线性可视化
  const max = Math.max(...history.map(h => h.close));
  const min = Math.min(...history.map(h => h.close));
  
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <p className="text-xs text-slate-500 font-medium mb-3">近30天价格走势</p>
      <div className="flex items-end gap-1 h-16">
        {history.slice(-20).map((item, i) => {
          const height = max === min ? 100 : ((item.close - min) / (max - min)) * 100;
          return (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-orange-500 to-amber-400 rounded-t-sm"
              style={{ height: `${Math.max(height, 5)}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-2">
        <span>{history[0]?.date}</span>
        <span>{history[history.length - 1]?.date}</span>
      </div>
    </div>
  );
};

// 企业详情
const CompanyDetail = ({ node, onNavigateToCompany }: { node: GraphNode; onNavigateToCompany?: (id: string) => void }) => {
  const { extra_data } = node;
  
  const latestReport = extra_data?.latest_report_period;
  const revenue = extra_data?.latest_revenue;
  const netProfit = extra_data?.latest_net_profit;
  const relatedNewsCount = extra_data?.related_news_count;
  const sensitiveMaterials = extra_data?.sensitive_materials;
  
  return (
    <div className="space-y-5">
      {node.description && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <p className="text-slate-700 leading-relaxed whitespace-pre-line">
              {node.description}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {extra_data?.stock_code && (
          <StatCard 
            icon={Building2} 
            label="股票代码" 
            value={extra_data.stock_code} 
            color="text-emerald-700" 
            bgColor="bg-emerald-50"
          />
        )}
        {extra_data?.material_count !== undefined && (
          <StatCard 
            icon={Package} 
            label="原材料种类" 
            value={extra_data.material_count} 
            color="text-orange-700" 
            bgColor="bg-orange-50"
          />
        )}
        {extra_data?.total_material_cost !== undefined && (
          <StatCard 
            icon={DollarSign} 
            label="原材料占比" 
            value={`${extra_data.total_material_cost}%`} 
            color="text-blue-700" 
            bgColor="bg-blue-50"
          />
        )}
        {relatedNewsCount !== undefined && (
          <StatCard 
            icon={Newspaper} 
            label="相关新闻" 
            value={relatedNewsCount} 
            color="text-purple-700" 
            bgColor="bg-purple-50"
          />
        )}
      </div>

      { (revenue !== undefined || netProfit !== undefined) && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-200">
          <p className="text-xs text-slate-500 font-medium mb-3">财务概览 {latestReport ? `(${latestReport})` : ''}</p>
          <div className="grid grid-cols-2 gap-3">
            {revenue !== undefined && (
              <div>
                <p className="text-xs text-slate-500">营收</p>
                <p className="text-lg font-bold text-slate-800">{typeof revenue === 'number' ? revenue.toFixed(2) : revenue}</p>
              </div>
            )}
            {netProfit !== undefined && (
              <div>
                <p className="text-xs text-slate-500">净利润</p>
                <p className="text-lg font-bold text-slate-800">{typeof netProfit === 'number' ? netProfit.toFixed(2) : netProfit}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {sensitiveMaterials && Array.isArray(sensitiveMaterials) && sensitiveMaterials.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <p className="text-xs text-red-700 font-medium">敏感原材料（成本占比 &gt; 15%）</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sensitiveMaterials.map((mat, i) => (
              <Badge key={i} variant="destructive" className="px-3 py-1.5">
                {mat}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">详细信息</h4>
        {extra_data?.industry && (
          <PropertyItem label="所属行业" value={extra_data.industry} icon={Layers} />
        )}
        {extra_data?.chain_position && (
          <PropertyItem 
            label="产业链位置" 
            value={
              extra_data.chain_position === 'upstream' ? '上游' :
              extra_data.chain_position === 'downstream' ? '下游' :
              extra_data.chain_position === 'midstream' ? '中游' :
              extra_data.chain_position
            } 
            icon={Network} 
          />
        )}
        {extra_data?.chain_position_detail && (
          <PropertyItem label="细分环节" value={extra_data.chain_position_detail} icon={Briefcase} />
        )}
      </div>

      {onNavigateToCompany && extra_data?.stock_code && (
        <Button 
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={() => onNavigateToCompany(extra_data.stock_code)}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          查看完整企业档案
        </Button>
      )}
    </div>
  );
};

// 原材料详情
const MaterialDetail = ({ node }: { node: GraphNode }) => {
  const { extra_data } = node;
  const costPercentage = extra_data?.cost_pct;
  const currentPrice = extra_data?.current_price;
  const changePct = extra_data?.change_pct;
  const unit = extra_data?.unit;
  const priceHistory = extra_data?.price_history;
  const relatedCompaniesCount = extra_data?.related_companies_count;
  const relatedNewsCount = extra_data?.related_news_count;
  const producingCountries = extra_data?.producing_countries;
  const importSources = extra_data?.import_sources;
  
  // 根据成本占比确定进度条颜色
  const getProgressColor = (percentage: number) => {
    if (percentage > 30) return "bg-red-500";
    if (percentage > 15) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-5">
      {node.description && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-5 border border-orange-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <p className="text-slate-700 leading-relaxed">
              {node.description}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* 显示价格信息（真实数据） */}
        {currentPrice !== undefined && (
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <p className="text-xs text-slate-500 font-medium">最新价格</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold text-slate-800">{currentPrice}</p>
              {unit && <p className="text-sm text-slate-500">{unit}</p>}
            </div>
            {changePct !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-sm ${changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {changePct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%</span>
              </div>
            )}
            {extra_data?.price_date && (
              <p className="text-xs text-slate-400 mt-1">{extra_data.price_date}</p>
            )}
          </div>
        )}
        
        {/* 关联企业数量 */}
        {relatedCompaniesCount !== undefined && (
          <StatCard 
            icon={Building2} 
            label="关联企业" 
            value={relatedCompaniesCount} 
            color="text-emerald-700" 
            bgColor="bg-emerald-50"
          />
        )}
        
        {/* 相关新闻数量 */}
        {relatedNewsCount !== undefined && (
          <StatCard 
            icon={Newspaper} 
            label="相关新闻" 
            value={relatedNewsCount} 
            color="text-blue-700" 
            bgColor="bg-blue-50"
          />
        )}
        
        {/* 成本占比（如果有的话） */}
        {costPercentage !== undefined && (
          <StatCard 
            icon={DollarSign} 
            label="成本占比" 
            value={`${costPercentage}%`} 
            color="text-orange-700" 
            bgColor="bg-orange-50"
          />
        )}
      </div>

      {/* 价格走势图 */}
      {priceHistory && priceHistory.length > 0 && (
        <PriceChart history={priceHistory} />
      )}

      {/* 成本占比进度条 */}
      {costPercentage !== undefined && (
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-medium">成本占比</span>
            <span className="text-lg font-bold text-slate-800">{costPercentage}%</span>
          </div>
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${getProgressColor(costPercentage)} transition-all duration-1000`}
              style={{ width: `${Math.min(costPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">市场信息</h4>
        {producingCountries && Array.isArray(producingCountries) && producingCountries.length > 0 && (
          <PropertyItem label="主要产国" value={producingCountries.join('、')} icon={MapPin} />
        )}
        {importSources && Array.isArray(importSources) && importSources.length > 0 && (
          <PropertyItem label="进口来源" value={importSources.join('、')} icon={Globe} />
        )}
        {extra_data?.contract && (
          <PropertyItem label="期货合约" value={extra_data.contract} icon={BarChart3} />
        )}
      </div>
    </div>
  );
};

// 新闻详情
const NewsDetail = ({ node }: { node: GraphNode }) => {
  const { extra_data } = node;
  const emotion = extra_data?.emotion;
  const eventType = extra_data?.event_type;
  const relatedMaterials = extra_data?.related_materials;
  const relatedCompanies = extra_data?.related_companies;
  
  const eventTypeLabels: Record<string, string> = {
    supply_disruption: '供应中断',
    price_surge: '价格暴涨',
    policy_favorable: '政策利好',
    monetary_policy: '货币政策',
    geopolitical: '地缘政治',
    natural_disaster: '自然灾害',
  };
  
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {extra_data?.pub_time && (
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">{extra_data.pub_time}</span>
          </div>
        )}
        {emotion && <EmotionBadge emotion={emotion} />}
        {eventType && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5" />
            {eventTypeLabels[eventType] || eventType}
          </Badge>
        )}
      </div>

      {node.description && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-slate-700 leading-relaxed">
              {node.description}
            </p>
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">详细信息</h4>
        {extra_data?.full_title && (
          <div className="flex items-start gap-3 py-2">
            <Newspaper className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-500 font-medium">完整标题</p>
              <p className="text-sm font-medium text-slate-700">{extra_data.full_title}</p>
            </div>
          </div>
        )}
        {extra_data?.source && (
          <PropertyItem label="消息来源" value={extra_data.source} icon={Globe} />
        )}
        
        {relatedMaterials && Array.isArray(relatedMaterials) && relatedMaterials.length > 0 && (
          <div className="py-2">
            <p className="text-xs text-slate-500 font-medium mb-2">影响原材料</p>
            <div className="flex flex-wrap gap-2">
              {relatedMaterials.map((mat, i) => (
                <Badge key={i} variant="secondary" className="px-2 py-1">
                  {mat}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {relatedCompanies && Array.isArray(relatedCompanies) && relatedCompanies.length > 0 && (
          <div className="py-2">
            <p className="text-xs text-slate-500 font-medium mb-2">关联企业</p>
            <div className="flex flex-wrap gap-2">
              {relatedCompanies.map((comp, i) => (
                <Badge key={i} variant="secondary" className="px-2 py-1">
                  {comp}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {extra_data?.url && (
          <Button 
            variant="secondary" 
            size="sm" 
            className="w-full mt-3"
            onClick={() => window.open(extra_data.url, "_blank")}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            查看原文
          </Button>
        )}
      </div>
    </div>
  );
};

// 产业链详情
const IndustryDetail = ({ node }: { node: GraphNode }) => {
  const { extra_data } = node;
  const chainPosition = extra_data?.chain_position;
  const relatedMaterials = extra_data?.related_materials;
  const relatedCompany = extra_data?.related_company;
  
  const positionLabels: Record<string, string> = {
    upstream: '上游',
    downstream: '下游',
    midstream: '中游',
    core: '核心环节',
  };
  
  const positionDesc: Record<string, string> = {
    upstream: '提供原材料和中间产品',
    downstream: '承接产品生产和销售',
    midstream: '连接上下游的中间环节',
    core: '产业链的核心环节',
  };
  
  return (
    <div className="space-y-5">
      {node.description && (
        <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <p className="text-slate-700 leading-relaxed">
              {node.description}
            </p>
          </div>
        </div>
      )}

      {chainPosition && (
        <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Layers className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">产业链位置</p>
              <p className="text-lg font-bold text-purple-700">{positionLabels[chainPosition] || chainPosition}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">{positionDesc[chainPosition] || ''}</p>
        </div>
      )}

      <Separator />

      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">相关信息</h4>
        {relatedCompany && (
          <PropertyItem label="关联企业" value={relatedCompany} icon={Building2} />
        )}
        {relatedMaterials && Array.isArray(relatedMaterials) && relatedMaterials.length > 0 && (
          <div className="py-2">
            <p className="text-xs text-slate-500 font-medium mb-2">相关原材料</p>
            <div className="flex flex-wrap gap-2">
              {relatedMaterials.map((mat, i) => (
                <Badge key={i} variant="secondary" className="px-2 py-1">
                  {mat}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 获取关联节点
const getConnectedNodes = (nodeId: string, graphData: GraphData | null | undefined) => {
  if (!graphData) return { incoming: [], outgoing: [] };
  
  const incoming = graphData.edges
    .filter(e => e.target === nodeId)
    .map(e => graphData.nodes.find(n => n.id === e.source))
    .filter(Boolean) as GraphNode[];
    
  const outgoing = graphData.edges
    .filter(e => e.source === nodeId)
    .map(e => graphData.nodes.find(n => n.id === e.target))
    .filter(Boolean) as GraphNode[];
  
  return { incoming, outgoing };
};

export default function NodeDetailPanel({ node, onAgentAnalysis, graphData, onNavigateToCompany }: Props) {
  // 计算关联关系数量
  const connectionCount = graphData 
    ? graphData.edges.filter(e => e.source === node?.id || e.target === node?.id).length
    : 0;
  
  const { incoming, outgoing } = node ? getConnectedNodes(node.id, graphData) : { incoming: [], outgoing: [] };

  if (!node) {
    return (
      <Card className="p-5 h-[800px] flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">节点详情</h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mb-5">
            <Info className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">点击图谱中的任意节点</h3>
          <p className="text-slate-500 leading-relaxed">
            查看新闻事件、原材料、产业链或企业的详细信息
          </p>
        </div>
      </Card>
    );
  }

  // 根据节点类型渲染不同内容
  const renderDetailContent = () => {
    switch (node.type) {
      case "company":
        return <CompanyDetail node={node} onNavigateToCompany={onNavigateToCompany} />;
      case "material":
        return <MaterialDetail node={node} />;
      case "news":
        return <NewsDetail node={node} />;
      case "industry":
        return <IndustryDetail node={node} />;
      default:
        return null;
    }
  };

  return (
    <Card className="p-5 h-[800px] flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="space-y-4 mb-5 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">节点详情</h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-slate-900 mb-2 leading-tight">
              {node.title}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={node.type} />
              {node.risk_level && <RiskBadge level={node.risk_level} />}
              {connectionCount > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  {connectionCount} 个连接
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 详情内容 - 可滚动 */}
      <div className="flex-1 overflow-y-auto pr-1">
        {renderDetailContent()}
        
        {/* 关联节点 */}
        {(incoming.length > 0 || outgoing.length > 0) && (
          <div className="mt-6">
            <Separator className="mb-5" />
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Network className="w-4 h-4" />
              关联关系
            </h4>
            
            {incoming.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 font-medium mb-2 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  来自
                </p>
                <div className="flex flex-wrap gap-2">
                  {incoming.map((n, i) => (
                    <Badge key={i} variant="secondary" className="px-2 py-1">
                      {n.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {outgoing.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-2 flex items-center gap-1">
                  <ArrowDownRight className="w-3 h-3" />
                  指向
                </p>
                <div className="flex flex-wrap gap-2">
                  {outgoing.map((n, i) => (
                    <Badge key={i} variant="secondary" className="px-2 py-1">
                      {n.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      {onAgentAnalysis && (
        <div className="mt-5 pt-4 border-t border-slate-200">
          <Button 
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            onClick={onAgentAnalysis}
          >
            <Bot className="w-4 h-4 mr-2" />
            AI 智能分析
          </Button>
        </div>
      )}
    </Card>
  );
}
