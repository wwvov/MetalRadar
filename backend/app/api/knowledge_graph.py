from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.core.database import get_db
from app.models.company import Company, CompanyMaterial
from app.models.news import News
from app.models.financial import FinancialReport
from app.services.futures_service import (
    get_futures_quote,
    get_futures_history,
    _get_unit,
)
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class GraphNode(BaseModel):
    id: str
    type: str
    title: str
    subtitle: Optional[str] = None
    risk_level: Optional[str] = None
    description: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


@router.get("/knowledge-graph", response_model=GraphResponse)
def get_knowledge_graph(
    company_ids: str = Query(..., description="Comma-separated company IDs"),
    include_news: bool = Query(True, description="Whether to include news nodes"),
    include_materials: bool = Query(True, description="Whether to include material nodes"),
    include_industries: bool = Query(True, description="Whether to include industry nodes"),
    db: Session = Depends(get_db)
):
    """
    Generate knowledge graph for selected companies
    """
    try:
        company_id_list = [cid.strip() for cid in company_ids.split(",") if cid.strip()]
        
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        edge_id_counter = 0
        
        # 1. Add company nodes
        companies = db.query(Company).filter(Company.id.in_(company_id_list)).all()
        
        material_ids_seen = set()
        news_ids_seen = set()
        
        for company in companies:
            node_id = f"company_{company.id}"
            
            # Get company materials
            company_materials = []
            try:
                company_materials = db.query(CompanyMaterial).filter(
                    CompanyMaterial.company_id == company.id
                ).all()
            except Exception as e:
                logger.error(f"Failed to get materials: {e}")
            
            # Calculate risk level based on material costs
            total_cost_pct = 0.0
            try:
                total_cost_pct = sum(
                    float(cm.cost_pct) for cm in company_materials 
                    if cm.cost_pct is not None
                )
            except:
                total_cost_pct = 0.0
            
            risk_level = "low"
            if total_cost_pct > 70:
                risk_level = "high"
            elif total_cost_pct > 40:
                risk_level = "medium"
            
            # Get related news count
            related_news_count = 0
            try:
                related_news_count = db.query(News).filter(
                    News.is_relevant == True,
                    News.title.contains(company.name)
                ).count()
            except:
                related_news_count = 0
            
            # Get sensitive materials (cost > 15%)
            sensitive_materials = []
            try:
                for cm in company_materials:
                    cost_pct = None
                    if cm.cost_pct:
                        cost_pct = float(cm.cost_pct)
                    if cost_pct and cost_pct > 15:
                        sensitive_materials.append(cm.material_name)
            except:
                pass
            
            # Get latest financial report
            latest_report = None
            try:
                latest_report = db.query(FinancialReport).filter(
                    FinancialReport.company_id == company.id
                ).order_by(FinancialReport.id.desc()).first()
            except:
                pass
            
            # Build company extra data
            extra_data = {
                "stock_code": company.id,
                "industry": company.industry,
                "business_desc": company.business_desc,
                "chain_position": company.position,
                "chain_position_detail": company.position_detail,
                "total_material_cost": round(total_cost_pct, 1),
                "material_count": len(company_materials),
                "sensitive_materials": sensitive_materials,
                "related_news_count": related_news_count,
            }
            
            if latest_report:
                extra_data["latest_report_period"] = latest_report.report_period
                try:
                    if latest_report.revenue:
                        extra_data["latest_revenue"] = float(latest_report.revenue)
                    if latest_report.net_profit:
                        extra_data["latest_net_profit"] = float(latest_report.net_profit)
                except:
                    pass
            
            # Add company node
            nodes.append(GraphNode(
                id=node_id,
                type="company",
                title=company.name,
                subtitle=company.industry if company.industry else None,
                risk_level=risk_level,
                description=company.business_desc if company.business_desc else None,
                extra_data=extra_data
            ))
            
            # Add material nodes
            if include_materials:
                for cm in company_materials:
                    material_name = cm.material_name
                    material_id = f"material_{material_name.replace(' ', '_')}"
                    
                    if material_id not in material_ids_seen:
                        # Get futures data
                        quote = None
                        history = []
                        unit = ""
                        try:
                            quote = get_futures_quote(material_name, cm.contract or "")
                            history = get_futures_history(material_name, cm.contract or "", days=30)
                            unit = _get_unit(material_name)
                        except Exception as e:
                            logger.error(f"Failed to get futures for {material_name}: {e}")
                        
                        # Build extra data
                        extra_data = {
                            "producing_countries": ["智利", "秘鲁", "中国"],
                            "import_sources": ["智利", "秘鲁"],
                            "related_companies_count": 5,
                            "related_news_count": 10,
                        }
                        
                        if quote:
                            extra_data["current_price"] = quote.get("price")
                            extra_data["change_pct"] = quote.get("change_pct")
                            extra_data["price_date"] = quote.get("date")
                            extra_data["unit"] = unit
                        
                        if history:
                            extra_data["price_history"] = history
                        
                        # Get cost percentage
                        cost_pct = None
                        try:
                            if cm.cost_pct:
                                cost_pct = float(cm.cost_pct)
                        except:
                            pass
                        
                        if cost_pct is not None:
                            extra_data["cost_pct"] = cost_pct
                        
                        nodes.append(GraphNode(
                            id=material_id,
                            type="material",
                            title=material_name,
                            subtitle=f"{cost_pct}%" if cost_pct else None,
                            risk_level="low",
                            description=f"{material_name}是重要原材料",
                            extra_data=extra_data
                        ))
                        material_ids_seen.add(material_id)
                    
                    # Add edge
                    label = None
                    try:
                        if cm.cost_pct:
                            label = f"{float(cm.cost_pct)}%"
                    except:
                        label = "依赖"
                    
                    edges.append(GraphEdge(
                        id=f"edge_{edge_id_counter}",
                        source=material_id,
                        target=node_id,
                        label=label
                    ))
                    edge_id_counter += 1
        
        # Add news nodes
        if include_news:
            for cm in company_materials:
                material_name = cm.material_name
                try:
                    news_list = db.query(News).filter(
                        News.is_relevant == True,
                        News.title.contains(material_name)
                    ).order_by(News.pub_time.desc()).limit(3).all()
                except Exception as e:
                    logger.error(f"Failed to get news: {e}")
                    news_list = []
                
                for news in news_list:
                    news_id = f"news_{news.id}"
                    if news_id not in news_ids_seen:
                        display_title = news.title
                        if len(display_title) > 20:
                            display_title = display_title[:18] + "…"
                        
                        pub_date = None
                        try:
                            pub_date = news.pub_time.strftime("%Y-%m-%d") if news.pub_time else None
                        except:
                            pass
                        
                        news_desc = None
                        try:
                            if news.summary:
                                if len(news.summary) > 150:
                                    news_desc = news.summary[:150] + "…"
                                else:
                                    news_desc = news.summary
                        except:
                            pass
                        
                        nodes.append(GraphNode(
                            id=news_id,
                            type="news",
                            title=display_title,
                            subtitle=pub_date,
                            risk_level="medium",
                            description=news_desc,
                            extra_data={}
                        ))
                        news_ids_seen.add(news_id)
                    
                    material_id = f"material_{material_name.replace(' ', '_')}"
                    if material_id in material_ids_seen:
                        edges.append(GraphEdge(
                            id=f"edge_{edge_id_counter}",
                            source=news_id,
                            target=material_id,
                            label="影响"
                        ))
                        edge_id_counter += 1
        
        return GraphResponse(nodes=nodes, edges=edges)
        
    except Exception as e:
        logger.error(f"Failed to generate knowledge graph: {e}", exc_info=True)
        return GraphResponse(nodes=[], edges=[])
