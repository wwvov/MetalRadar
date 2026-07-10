import { useMemo, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  Handle,
  Position,
} from "reactflow";
import dagre from "dagre";

import type { Node, Edge } from "reactflow";
import type { GraphNode, GraphData } from "@/services/knowledgeGraphService";

import "reactflow/dist/style.css";

interface GraphCanvasProps {
  graph: GraphData;
  onNodeSelect?: (node: GraphNode) => void;
}

const nodeWidth = 180;
const nodeHeight = 80;

// 定义节点层级顺序：宏观新闻(news) -> 原材料(material) -> 产业链(industry) -> 企业(company)
const getNodeRank = (type: string): number => {
  switch (type) {
    case "news": return 1;
    case "material": return 2;
    case "industry": return 3;
    case "company": return 4;
    default: return 3;
  }
};

// 自定义节点组件
const CustomNode = ({ data }: { data: any }) => {
  const { item } = data;
  
  let borderColor = "border-emerald-500";
  let bgColor = "bg-gradient-to-br from-emerald-50 to-emerald-100";
  let textColor = "text-emerald-800";
  let icon = "🏢";
  
  if (item.type === "news") {
    borderColor = "border-blue-500";
    bgColor = "bg-gradient-to-br from-blue-50 to-blue-100";
    textColor = "text-blue-800";
    icon = "📰";
  } else if (item.type === "material") {
    borderColor = "border-orange-500";
    bgColor = "bg-gradient-to-br from-orange-50 to-orange-100";
    textColor = "text-orange-800";
    icon = "📦";
  } else if (item.type === "industry") {
    borderColor = "border-purple-500";
    bgColor = "bg-gradient-to-br from-purple-50 to-purple-100";
    textColor = "text-purple-800";
    icon = "🔗";
  }

  // 根据风险等级添加风险标识
  let riskBadge = null;
  if (item.risk_level) {
    const riskConfig = {
      low: { bg: "bg-green-500", text: "text-white", label: "低" },
      medium: { bg: "bg-yellow-500", text: "text-white", label: "中" },
      high: { bg: "bg-red-500", text: "text-white", label: "高" }
    };
    const config = riskConfig[item.risk_level as keyof typeof riskConfig];

    riskBadge = (
      <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full ${config.bg} ${config.text} flex items-center justify-center text-xs font-bold shadow-md`}>
        {config.label}
      </div>
    );
  }

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      <div className={`rounded-2xl border-3 ${borderColor} ${bgColor} px-4 py-3 shadow-lg text-center min-w-[160px] cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:-translate-y-1`}>
        <div className="text-2xl mb-1">{icon}</div>
        <div className={`font-semibold ${textColor} text-sm leading-tight`}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-xs text-slate-600 mt-1">
            {item.subtitle}
          </div>
        )}
      </div>
      {riskBadge}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  );
};

// 自定义边标签
const EdgeLabel = ({ label }: { label?: string }) => {
  if (!label) return null;
  return (
    <div className="bg-white px-2 py-1 rounded-full text-xs text-slate-600 border border-slate-200 shadow-sm">
      {label}
    </div>
  );
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], originalNodes: GraphNode[]) => {
  // 每次都创建新的 dagreGraph 实例，避免布局污染
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // TB = Top to Bottom (从上到下)
  dagreGraph.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 80 });

  nodes.forEach((node, index) => {
    const originalNode = originalNodes[index];
    const rank = getNodeRank(originalNode.type);
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight, rank });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
};

function LayoutController() {
  const { fitView } = useReactFlow();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView]);

  return null;
}

export default function GraphCanvas({
  graph,
  onNodeSelect,
}: GraphCanvasProps) {
  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    const initialNodes: Node[] = graph.nodes.map((item) => ({
      id: item.id,
      type: "custom",
      position: { x: 0, y: 0 },
      data: { item },
    }));

    const initialEdges: Edge[] = graph.edges.map((e, index) => ({
      id: e.id || `edge-${index}`,
      source: e.source,
      target: e.target,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#64748b",
      },
      animated: true,
      label: e.label,
      labelComponent: <EdgeLabel label={e.label} />,
      style: {
        stroke: "#94a3b8",
        strokeWidth: 2,
      },
    }));

    return getLayoutedElements(initialNodes, initialEdges, graph.nodes);
  }, [graph]);

  const handleNodeClick = (_: unknown, node: Node) => {
    const found = graph.nodes.find(n => n.id === node.id);
    if (found) {
      onNodeSelect?.(found);
    }
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100">
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e2e8f0" size={1} />
        <Controls className="bg-white/90 backdrop-blur border border-slate-200 shadow-xl rounded-xl" />
        <LayoutController />
      </ReactFlow>
    </div>
  );
}
