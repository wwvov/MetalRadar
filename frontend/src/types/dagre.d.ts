declare module 'dagre' {
  interface GraphOptions {
    rankdir?: string
    nodesep?: number
    ranksep?: number
    [key: string]: unknown
  }

  interface NodeConfig {
    width: number
    height: number
    rank?: number
    [key: string]: unknown
  }

  interface NodePosition {
    x: number
    y: number
    width: number
    height: number
  }

  interface Graph {
    setGraph(options: GraphOptions): void
    setDefaultEdgeLabel(fn: () => object): void
    setNode(id: string, config: NodeConfig): void
    setEdge(source: string, target: string): void
    node(id: string): NodePosition
  }

  interface DagreStatic {
    graphlib: {
      Graph: new () => Graph
    }
    layout(graph: Graph): void
  }

  const dagre: DagreStatic
  export default dagre
}
