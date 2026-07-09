"""公司相关 API — 对齐 api-spec.md"""

import logging
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import company_service
from app.services.llm_service import PortraitGenerationError
from app.services.pdf_parser import extract_text_from_pdf
from app.schemas.company import CompanySearchResult, CompanyDetailOut, PortraitUpdateIn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["公司"])

DEFAULT_USER = "default"


@router.get("/search", response_model=CompanySearchResult)
def search(keyword: str = Query(..., min_length=1, description="搜索关键词"), db: Session = Depends(get_db)):
    """搜索 A 股公司 — 从 akshare 全量列表实时匹配"""
    return company_service.search_companies(db, keyword)


@router.get("/with-materials")
def get_companies_with_materials(db: Session = Depends(get_db)):
    """获取所有有敏感材料数据的公司列表 — 用于仪表盘公司选择器"""
    from app.models.company import Company, CompanyMaterial
    from sqlalchemy import distinct
    company_ids = db.query(distinct(CompanyMaterial.company_id)).all()
    ids = [row[0] for row in company_ids]
    companies = db.query(Company).filter(Company.id.in_(ids)).all()
    return {
        "ok": True,
        "data": [
            {
                "id": c.id,
                "name": c.name,
                "code": c.id,
                "industry": c.industry or "",
            }
            for c in companies
        ],
    }


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_detail(company_id: str, db: Session = Depends(get_db)):
    """获取公司详情（含画像）— 若画像无效则自动触发重新生成"""
    result = company_service.get_company_detail(db, company_id)

    if not result:
        # 公司记录不存在 — 尝试自动创建（快速模式：15秒超时，1次重试）
        logger.info(f"公司 {company_id} 记录不存在，尝试自动初始化...")
        try:
            result = company_service.init_company_profile(
                db, company_id, report_text=None, company_name="",
                llm_timeout=15, llm_retries=1,
            )
        except PortraitGenerationError:
            # LLM 不可用 — 创建占位记录，让用户稍后手动重新生成
            logger.warning(f"公司 {company_id} LLM不可用，创建占位记录")
            result = company_service.init_company_profile_fallback(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"公司初始化失败: {str(e)}")
        return result

    # 自动修复：画像无效 → 重新生成（快速模式：15秒超时，1次重试）
    if not result.portrait_generated:
        logger.info(f"公司 {company_id} 画像无效，自动触发重新生成...")
        try:
            result = company_service.init_company_profile(
                db, company_id,
                report_text=None,
                company_name=result.name if result.name != company_id else "",
                llm_timeout=15, llm_retries=1,
            )
        except PortraitGenerationError:
            logger.warning(f"公司 {company_id} 自动重新生成失败，返回现有占位数据")
        except Exception:
            logger.warning(f"公司 {company_id} 自动重新生成异常，返回现有数据")

    return result


@router.post("/init", response_model=CompanyDetailOut)
async def init_company(
    company_code: str = Form(...),
    company_name: str = Form(""),
    report_pdf: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """初始化公司画像 — 用户确认添加公司时调用，由大模型生成完整画像"""
    report_text = None
    if report_pdf:
        content = await report_pdf.read()
        try:
            report_text = extract_text_from_pdf(content)
            if not report_text.strip():
                logger.warning(f"上传的PDF未提取到文本内容（可能是扫描件/图片PDF）")
                report_text = None
        except ValueError as e:
            logger.warning(f"PDF解析失败: {e}")
            report_text = None

    try:
        return company_service.init_company_profile(db, company_code, report_text, company_name)
    except PortraitGenerationError as e:
        raise HTTPException(status_code=502, detail=f"AI服务暂时不可用: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"画像生成失败: {str(e)}")


@router.put("/{company_id}/portrait", response_model=CompanyDetailOut)
def update_portrait(company_id: str, data: PortraitUpdateIn, db: Session = Depends(get_db)):
    """保存用户修正后的公司画像"""
    try:
        return company_service.update_company_portrait(db, company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{company_id}/regenerate", response_model=CompanyDetailOut)
async def regenerate_portrait(
    company_id: str,
    report_pdf: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """重新生成公司画像 — 用户更换财报后重新调用大模型"""
    report_text = None
    if report_pdf:
        content = await report_pdf.read()
        try:
            report_text = extract_text_from_pdf(content)
            if not report_text.strip():
                logger.warning(f"上传的PDF未提取到文本内容（可能是扫描件/图片PDF）")
                report_text = None
        except ValueError as e:
            logger.warning(f"PDF解析失败: {e}")
            report_text = None

    try:
        return company_service.regenerate_company_portrait(db, company_id, report_text)
    except PortraitGenerationError as e:
        raise HTTPException(status_code=502, detail=f"AI服务暂时不可用: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{company_id}/upload-report", response_model=CompanyDetailOut)
async def upload_financial_report(
    company_id: str,
    report_pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传财报PDF — 仅提取财务数据，不重新生成画像"""
    # 文件大小校验（服务端二次校验）
    content = await report_pdf.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > 25:
        raise HTTPException(status_code=400, detail=f"文件过大（{file_size_mb:.1f}MB），请上传小于25MB的PDF")

    logger.info(f"收到财报上传: company={company_id}, file={report_pdf.filename}, size={file_size_mb:.1f}MB")

    # 解析 PDF
    try:
        report_text = extract_text_from_pdf(content)
        if not report_text.strip():
            raise HTTPException(
                status_code=400,
                detail="PDF未提取到文本内容，可能是扫描件/图片PDF，请上传包含文字层的PDF文件",
            )
        logger.info(f"PDF文本提取成功: {len(report_text)} 字符, company={company_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 调用 LLM 提取财务数据（较耗时，前端已设置3分钟超时）
    try:
        from app.services.llm_service import extract_financial_report, FinancialExtractionError
        financial_data = extract_financial_report(report_text, company_id)
    except FinancialExtractionError as e:
        logger.error(f"财报AI提取失败: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"AI财报分析失败，请检查API配置或稍后重试。错误详情: {str(e)}",
        )
    except Exception as e:
        logger.error(f"财报分析异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"财报分析异常: {str(e)}")

    if not financial_data.get("report_period"):
        raise HTTPException(status_code=422, detail="AI未能从PDF中识别到有效的报告期信息，请确认PDF包含完整的财务报表")

    # 保存到数据库
    try:
        result = company_service.save_financial_report(db, company_id, financial_data)
        logger.info(f"财报数据已保存: company={company_id}, period={financial_data.get('report_period')}")
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{company_id}/financials")
def get_financials(company_id: str, db: Session = Depends(get_db)):
    """获取公司财务数据（聚合接口）

    数据优先级：
    1. financial_reports 表中 extraction_source='user_edit' 的记录
    2. financial_reports 表中 extraction_source='report_ai' 的记录（最新一条）
    3. 东方财富三大报表接口（akshare，缓存1天）
    4. 都无数据时返回空
    """
    try:
        result = company_service.get_aggregated_financials(db, company_id)
        return {"ok": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"获取财务数据失败 {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"获取财务数据失败: {str(e)}")


@router.post("/{company_id}/analyze-chain")
def analyze_chain(company_id: str, db: Session = Depends(get_db)):
    """使用 LLM 分析公司在产业链中的完整位置

    生成内容包括:
    1. Mermaid 产业链全景流程图
    2. 各环节业务说明（上游→中游→下游→其他）
    3. 产业链位置总结（覆盖环节、核心环节、精准标签、综合解读）

    结果存储在 company.chain_analysis JSON 字段中，后续请求直接返回缓存。
    传 force=true 可强制重新生成。
    """
    try:
        result = company_service.analyze_company_chain(db, company_id)
        return {"ok": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"产业链分析失败 {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"产业链分析失败: {str(e)}")


@router.get("/{company_id}/cost-pressure")
def get_cost_pressure(company_id: str, db: Session = Depends(get_db)):
    """获取公司材料成本压力数据

    复用 futures_service.get_dashboard_data 计算各品种成本压力。
    包含：基准价、当前价、涨跌幅、压力等级。
    """
    from app.services.stock_service import get_cost_pressure_data
    try:
        data = get_cost_pressure_data(db, company_id)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"获取成本压力失败 {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"获取成本压力失败: {str(e)}")


@router.get("/{company_id}/divergence")
def get_divergence(
    company_id: str,
    material: str = Query("", description="品种名，为空则使用成本占比最高的品种"),
    db: Session = Depends(get_db),
):
    """股票价格 vs 期货价格背离分析

    计算股票价格与敏感原材料期货价格的60日滚动相关系数，
    识别背离区间，生成AI解读文本。

    返回: {correlation_series, events, analysis_text, stock_code, material}
    """
    from app.services.stock_service import get_divergence_analysis
    try:
        data = get_divergence_analysis(db, company_id, material)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"背离分析失败 {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"背离分析失败: {str(e)}")
