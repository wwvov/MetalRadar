import api from './api'

export interface GraphNode {
  id: string
  type: 'news' | 'material' | 'industry' | 'company'
  title: string
  subtitle?: string
  risk_level?: 'low' | 'medium' | 'high'
  description?: string
  extra_data?: Record<string, any>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphFilters {
  includeNews?: boolean
  includeMaterials?: boolean
  includeIndustries?: boolean
}

export const knowledgeGraphService = {
  getGraph: async (companyIds: string[], filters?: GraphFilters): Promise<GraphData> => {
    const { data } = await api.get<GraphData>('/knowledge-graph', {
      params: {
        company_ids: companyIds.join(','),
        include_news: filters?.includeNews ?? true,
        include_materials: filters?.includeMaterials ?? true,
        include_industries: filters?.includeIndustries ?? true
      }
    })
    return data
  }
}

export default knowledgeGraphService