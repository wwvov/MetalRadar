"""Agent Chat & Report — Pydantic 请求/响应模型"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


# ─── Chat ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """对话消息"""
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """聊天请求"""
    company_id: Optional[str] = Field(None, description="当前选中的公司ID")
    message: str = Field(..., min_length=1, max_length=4000, description="用户输入")
    scenario: Optional[Literal["risk_scan", "event_impact", "free_qa"]] = Field(
        None, description="分析场景：风险扫描 / 事件传导 / 自由问答"
    )
    history: Optional[list[ChatMessage]] = Field(None, description="历史对话（最多20轮）")
    session_id: Optional[str] = Field(None, description="会话ID（用于持久化存储）")
    model: Optional[str] = Field("glm-5.2", description="使用的模型")


class ChartData(BaseModel):
    """内嵌图表"""
    type: Literal["line", "bar", "gauge", "pie", "flow"]
    title: Optional[str] = None
    data: dict = Field(default_factory=dict)


class SourceItem(BaseModel):
    """数据源引用"""
    source: str  # "Reuters" | "LME" | "SMM" | "东方财富" | ...
    content: str


class ChatResponse(BaseModel):
    """聊天响应"""
    reply: str = Field(..., description="Agent自然语言回复")
    charts: Optional[list[ChartData]] = Field(None, description="可选的内嵌图表列表")
    risk_score: Optional[float] = Field(None, description="风险评分 0-100（如有）")
    risk_level: Optional[str] = Field(None, description="风险等级：低/中/高")
    sources: Optional[list[SourceItem]] = Field(None, description="数据依据")


# ─── Report ──────────────────────────────────────────────────────────────────

class ReportGenerateRequest(BaseModel):
    """生成报告请求"""
    company_id: str = Field(..., description="目标公司ID")
    material: Optional[str] = Field(None, description="指定物料品种（可选，默认选最高风险品种）")
    conversation_id: Optional[str] = Field(None, description="引用的对话ID")


class ScenarioItem(BaseModel):
    """压力情景"""
    name: str
    price_change_pct: float  # 原料价格变动%
    fx_change_pct: float     # 汇率变动%


class PressureTestRequest(BaseModel):
    """压力测试请求"""
    company_id: str
    scenarios: list[ScenarioItem]


class PressureTestScenario(BaseModel):
    """压力测试情景结果"""
    name: str
    price_change_pct: float
    fx_change_pct: float
    estimated_cost: float       # 预计营业成本(元)
    estimated_gross_margin: float  # 预计毛利率(%)
    margin_change_pp: float     # 毛利率变动(百分点)
    risk_score: float           # 情景风险评分


class RiskFactor(BaseModel):
    """风险因子贡献"""
    name: str      # "新闻情绪" / "价格波动" / "成本传导" / "宏观环境" / "汇率波动"
    score: float   # 0-100 子评分
    weight: float  # 权重 (0-1)
    description: str  # 一句话说明


class ReasoningStep(BaseModel):
    """推理步骤"""
    step: int
    title: str
    detail: str


class Recommendation(BaseModel):
    """行动建议"""
    priority: int  # 1-3
    action: str
    detail: str


class RiskReport(BaseModel):
    """风险分析报告"""
    report_id: str
    generated_at: str
    company_name: str
    company_code: str
    material_name: str

    # Executive Summary
    risk_score: float
    risk_level: str  # "低风险" / "中等风险" / "高风险"
    summary: str
    current_price: Optional[float] = None
    price_change_24h: Optional[float] = None

    # 推理链路
    reasoning: list[ReasoningStep]

    # 数据依据
    sources: list[SourceItem]

    # 风险因子
    factors: list[RiskFactor]

    # 情景模拟
    scenarios: Optional[list[PressureTestScenario]] = None

    # 建议
    recommendations: list[Recommendation]

    # 图表数据（前端渲染用）
    charts: Optional[list[ChartData]] = None


class ExportRequest(BaseModel):
    """导出请求"""
    report_id: str
    format: Literal["html", "pdf"] = "html"
