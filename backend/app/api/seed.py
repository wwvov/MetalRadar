"""开发环境种子数据 — 仅用于本地开发测试"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.news import News
from app.models.company import Company, CompanyMaterial
from app.models.user import UserFollow
from datetime import datetime, timedelta

router = APIRouter(prefix="/seed", tags=["开发工具"])
DEFAULT_USER = "default"

ET = {
    "SUPPLY": "supply_disruption", "PRICE_UP": "price_surge", "PRICE_DOWN": "price_drop",
    "POLICY": "policy_favorable", "MONETARY": "monetary_policy", "MACRO": "macro_economy",
    "INDUSTRY": "industry_trend", "DEMAND": "demand_change",
    "INVENTORY": "inventory_change", "GEOPOLITICAL": "geopolitical",
}
EM = {"POS": "positive", "NEG": "negative", "NEU": "neutral"}


@router.post("/sprint1")
def seed_sprint1(db: Session = Depends(get_db)):
    now = datetime.now()

    companies_data = [
        {"id": "002460", "name": "江西赣锋锂业股份有限公司", "short_name": "赣锋锂业",
         "industry": "有色金属", "position": "mid", "position_detail": "锂盐加工",
         "business_desc": "全球领先的锂化合物和金属锂生产商。",
         "materials": [
             {"material_name": "碳酸锂", "cost_pct": 45.0, "source": "report", "direction": "positive", "contract": "LC主力"},
             {"material_name": "锂辉石", "cost_pct": 30.0, "source": "report", "direction": "negative", "contract": "LC主力"},
         ]},
        {"id": "601899", "name": "紫金矿业集团股份有限公司", "short_name": "紫金矿业",
         "industry": "有色金属", "position": "up", "position_detail": "矿产采选",
         "business_desc": "以金、铜、锌等金属矿产资源勘查和开发为主的大型矿业集团。",
         "materials": [
             {"material_name": "铜", "cost_pct": 35.0, "source": "report", "direction": "positive", "contract": "CU主力"},
             {"material_name": "黄金", "cost_pct": 40.0, "source": "report", "direction": "positive", "contract": "AU主力"},
         ]},
        {"id": "601127", "name": "赛力斯集团股份有限公司", "short_name": "赛力斯",
         "industry": "汽车", "position": "down", "position_detail": "整车制造",
         "business_desc": "新能源汽车制造商，与华为深度合作，主打问界系列车型。",
         "materials": [
             {"material_name": "碳酸锂", "cost_pct": 25.0, "source": "inferred", "direction": "negative", "contract": "LC主力"},
             {"material_name": "铝", "cost_pct": 15.0, "source": "inferred", "direction": "negative", "contract": "AL主力"},
             {"material_name": "铜", "cost_pct": 8.0, "source": "inferred", "direction": "negative", "contract": "CU主力"},
         ]},
    ]
    for c_data in companies_data:
        materials = c_data.pop("materials")
        c = Company(**c_data)
        db.add(c)
        db.flush()
        for m in materials:
            db.add(CompanyMaterial(company_id=c.id, **m))
        db.add(UserFollow(user_id=DEFAULT_USER, company_id=c.id))

    # (title, summary, source, companies, metals, event_type, emotion, tags)
    macro_panel = [
        ("央行宣布降准0.5个百分点 释放长期流动性约1万亿元", "央行下调存款准备金率以支持实体经济。", "财经早餐", [], [], ET["MONETARY"], EM["POS"], ["央行", "降准", "流动性", "货币政策"]),
        ("6月制造业PMI回升至50.2 连续两月位于扩张区间", "国家统计局公布6月制造业PMI数据。", "财经早餐", [], [], ET["MACRO"], EM["POS"], ["PMI", "制造业", "宏观经济"]),
        ("美联储维持利率不变 暗示年内可能降息两次", "美联储6月议息会议决定维持联邦基金利率不变。", "财经早餐", [], [], ET["MONETARY"], EM["NEU"], ["美联储", "利率", "降息"]),
        ("国务院部署稳经济一揽子增量政策", "国务院常务会议研究部署稳经济增量政策措施。", "财经早餐", [], [], ET["POLICY"], EM["POS"], ["国务院", "稳经济", "增量政策"]),
        ("1-6月全国规模以上工业企业利润同比增长3.5%", "国家统计局发布上半年工业企业利润数据。", "财经早餐", [], [], ET["MACRO"], EM["POS"], ["工业企业", "利润", "宏观经济"]),
        ("人民币对美元中间价调升152个基点", "外汇交易中心公布人民币汇率中间价。", "财经早餐", [], [], ET["MACRO"], EM["POS"], ["人民币", "汇率", "中间价"]),
        ("财政部：1-6月全国一般公共预算收入同比增长5.2%", "财政部发布上半年财政收支数据。", "财经早餐", [], [], ET["POLICY"], EM["POS"], ["财政部", "公共预算", "财政收入"]),
        ("国际货币基金组织上调中国2026年GDP增速预期至5.1%", "IMF发布最新世界经济展望报告。", "财经早餐", [], [], ET["MACRO"], EM["POS"], ["IMF", "GDP", "经济增长"]),
    ]

    shmet_news = [
        ("伦铜库存降至近三年新低 现货升水扩大", "LME铜库存降至8.2万吨，为近三年最低水平。", "上海金属网", [], ["铜"], ET["INVENTORY"], EM["POS"], ["铜", "LME", "库存", "现货升水"]),
        ("智利Escondida铜矿罢工风险上升", "全球最大铜矿面临罢工威胁，年产量约占全球5%。", "上海金属网", [], ["铜"], ET["SUPPLY"], EM["NEG"], ["铜", "智利", "罢工", "供应扰动"]),
        ("铜价突破10000美元关口 供应紧张持续", "LME铜价创六个月新高，供应紧张格局延续。", "上海金属网", ["601899"], ["铜"], ET["PRICE_UP"], EM["POS"], ["铜", "LME", "价格突破"]),
        ("云南电解铝复产进度不及预期 铝价获支撑", "受降雨偏少影响复产慢于预期，铝现货升水维持高位。", "上海金属网", [], ["铝"], ET["SUPPLY"], EM["POS"], ["铝", "电解铝", "云南", "复产"]),
        ("汽车轻量化带动铝需求增长12%", "新能源汽车推动铝材需求，三季度订单排满。", "上海金属网", ["601127"], ["铝"], ET["DEMAND"], EM["POS"], ["铝", "汽车轻量化", "新能源"]),
        ("铅蓄电池旺季来临 铅价震荡偏强", "夏季更换需求进入旺季，铅社会库存降至4.5万吨。", "上海金属网", [], ["铅"], ET["DEMAND"], EM["POS"], ["铅", "铅蓄电池", "旺季"]),
        ("锌精矿加工费持续走低 冶炼企业利润承压", "进口锌精矿加工费降至50美元/干吨以下。", "上海金属网", [], ["锌"], ET["PRICE_DOWN"], EM["NEG"], ["锌", "锌精矿", "加工费", "冶炼"]),
        ("印尼镍矿审批加速 供应宽松预期增强", "印尼加快镍矿开采配额审批，LME镍库存回升。", "上海金属网", [], ["镍"], ET["SUPPLY"], EM["NEG"], ["镍", "印尼", "镍矿", "供应宽松"]),
        ("不锈钢需求回暖 镍铁价格小幅反弹", "不锈钢厂排产环比增长，镍铁需求改善。", "上海金属网", [], ["镍"], ET["DEMAND"], EM["POS"], ["镍", "不锈钢", "镍铁"]),
        ("缅甸锡矿复产推迟 全球供应缺口扩大至1.5万吨", "佤邦锡矿复产时间再度推迟至四季度。", "上海金属网", [], ["锡"], ET["SUPPLY"], EM["POS"], ["锡", "缅甸", "佤邦", "供应缺口"]),
        ("国际金价突破2500美元创历史新高", "COMEX黄金期货突破2500美元/盎司，避险需求强劲。", "上海金属网", ["601899"], ["黄金"], ET["PRICE_UP"], EM["POS"], ["黄金", "金价", "避险", "历史新高"]),
        ("白银光伏需求与投资需求共振 银价补涨", "光伏装机增长带动白银工业需求，金银比处历史高位。", "上海金属网", [], ["白银"], ET["DEMAND"], EM["POS"], ["白银", "光伏", "金银比"]),
        ("铂金供应缺口扩大 南非电力危机影响生产", "南非电力供应不稳定影响铂金生产，供应缺口扩大。", "上海金属网", [], ["铂"], ET["SUPPLY"], EM["NEG"], ["铂", "南非", "电力危机"]),
        ("碳酸锂价格跌破8万元/吨 锂盐企业承压", "碳酸锂期货创年内新低，下游需求增速放缓。", "上海金属网", ["002460"], ["锂"], ET["PRICE_DOWN"], EM["NEG"], ["碳酸锂", "锂盐", "价格下跌"]),
        ("钴价持续低迷 刚果(金)供应过剩格局难改", "钴金属价格跌至两年低位，去钴化趋势加速。", "上海金属网", [], ["钴"], ET["PRICE_DOWN"], EM["NEG"], ["钴", "刚果金", "供应过剩"]),
        ("稀土价格企稳回升 北方稀土上调挂牌价", "北方稀土上调镨钕产品挂牌价5%，新能源需求回暖。", "上海金属网", [], ["稀土"], ET["PRICE_UP"], EM["POS"], ["稀土", "北方稀土", "挂牌价"]),
        ("钨精矿供应偏紧 价格高位运行", "主产区环保督查持续，矿山开工率维持低位。", "上海金属网", [], ["钨"], ET["SUPPLY"], EM["POS"], ["钨", "钨精矿", "环保"]),
        ("钼铁招标价突破28万元创新高", "钼铁招标价创年内新高，不锈钢需求拉动。", "上海金属网", [], ["钼"], ET["PRICE_UP"], EM["POS"], ["钼", "钼铁", "招标"]),
        ("锑价持续上涨 资源稀缺性凸显", "国内锑矿产量下降，资源稀缺性推动价格上涨。", "上海金属网", [], ["锑"], ET["SUPPLY"], EM["POS"], ["锑", "稀缺资源"]),
        ("铁矿石价格震荡走高 钢厂补库需求释放", "港口铁矿石库存连续下降，钢厂补库需求增加。", "上海金属网", [], ["铁矿石"], ET["DEMAND"], EM["POS"], ["铁矿石", "钢厂", "补库"]),
        ("螺纹钢社会库存加速去化 旺季预期向好", "螺纹钢社会库存连续六周下降，旺季预期向好。", "上海金属网", [], ["螺纹钢"], ET["INVENTORY"], EM["POS"], ["螺纹钢", "库存", "去化"]),
        ("热卷出口订单回暖 钢厂挺价意愿增强", "热卷出口询单增加，钢厂挺价意愿增强。", "上海金属网", [], ["热卷"], ET["DEMAND"], EM["POS"], ["热卷", "出口", "订单"]),
        ("不锈钢期货震荡偏强 原料成本支撑", "镍铁和铬铁价格上涨推升成本，不锈钢期货走强。", "上海金属网", [], ["不锈钢"], ET["PRICE_UP"], EM["POS"], ["不锈钢", "期货", "成本支撑"]),
        ("原油价格震荡上行 OPEC+维持减产协议", "OPEC+决定维持现有减产规模，原油供应偏紧。", "上海金属网", [], ["原油"], ET["SUPPLY"], EM["POS"], ["原油", "OPEC", "减产"]),
        ("动力煤价格企稳 夏季用电高峰来临", "电厂日耗回升，动力煤价格企稳。", "上海金属网", [], ["动力煤"], ET["DEMAND"], EM["POS"], ["动力煤", "用电高峰"]),
        ("纯碱现货价格反弹 光伏玻璃需求拉动", "光伏玻璃产能扩张拉动纯碱需求，现货价格反弹。", "上海金属网", [], ["纯碱"], ET["DEMAND"], EM["POS"], ["纯碱", "光伏玻璃"]),
    ]

    other_news = [
        ("赣锋锂业获多家机构增持评级", "多家券商给予增持评级，目标价有30%以上空间。", "东方财富", ["002460"], ["锂"], ET["INDUSTRY"], EM["POS"], ["赣锋锂业", "机构评级", "增持"]),
        ("紫金矿业上半年铜产量同比增长15%", "铜产量达45万吨，黄金产量同比增长8%。", "东方财富", ["601899"], ["铜", "黄金"], ET["INDUSTRY"], EM["POS"], ["紫金矿业", "铜产量", "业绩增长"]),
        ("新能源汽车6月销量创新高 赛力斯问界M9热销", "6月新能源车销量突破100万辆，问界M9交付超2万辆。", "财联社", ["601127"], [], ET["INDUSTRY"], EM["POS"], ["新能源汽车", "赛力斯", "问界M9"]),
        ("工信部推动有色金属行业数字化转型", "到2028年行业数字化水平显著提升，支持智能矿山建设。", "财经早餐", [], ["铜", "铝", "锂"], ET["POLICY"], EM["POS"], ["工信部", "有色金属", "数字化转型"]),
        ("全球铜库存持续下降 铜价有望反弹", "LME铜库存降至近三年低位，分析师预计下半年铜价反弹。", "东方财富", ["601899"], ["铜"], ET["INVENTORY"], EM["POS"], ["铜", "库存", "铜价反弹"]),
        ("锂电行业去库存接近尾声 下游排产回升", "头部电池厂7月排产环比增长10%以上，碳酸锂需求回暖。", "上海金属网", ["002460"], ["锂"], ET["INVENTORY"], EM["POS"], ["锂电", "去库存", "排产"]),
        ("欧盟碳边境调节机制过渡期结束 铝出口成本上升", "欧盟CBAM正式实施，中国铝产品出口成本上升。", "财联社", [], ["铝"], ET["POLICY"], EM["NEG"], ["欧盟", "碳边境", "CBAM", "铝出口"]),
        ("宁德时代发布新一代钠离子电池 能量密度提升30%", "钠离子电池技术突破可能影响锂需求预期。", "东方财富", ["002460"], ["锂"], ET["INDUSTRY"], EM["POS"], ["宁德时代", "钠离子电池", "技术突破"]),
    ]

    macro_news = [
        ("央行下调LPR利率 支持实体经济发展", "1年期LPR为3.45%，5年期以上LPR为3.95%。", "财经早餐", [], [], ET["MONETARY"], EM["POS"], ["央行", "LPR", "降息"]),
        ("国务院常务会议部署稳经济一揽子政策", "加大财政支出力度、降低企业税费负担、稳定外贸外资。", "财经早餐", [], [], ET["POLICY"], EM["POS"], ["国务院", "稳经济", "一揽子政策"]),
        ("发改委：进一步扩大内需 促进消费提质升级", "发改委发布促消费政策文件，扩大内需。", "财经早餐", [], [], ET["POLICY"], EM["POS"], ["发改委", "扩大内需", "消费"]),
        ("上半年GDP同比增长5.2% 经济运行总体平稳", "国家统计局发布上半年国民经济运行数据。", "财经早餐", [], [], ET["MACRO"], EM["NEU"], ["GDP", "经济增长", "国民经济"]),
    ]

    all_news = macro_panel + shmet_news + other_news + macro_news

    for i, (title, summary, source, companies, metals, event_type, emotion, tags) in enumerate(all_news):
        db.add(News(
            id=f"news_{now.strftime('%Y%m%d')}_{i:03d}",
            title=title, summary=summary, source=source,
            pub_time=now - timedelta(minutes=i * 30),
            tags=tags, company_entities=companies, metal_entities=metals,
            relevance_level="gray", emotion=emotion,
            is_relevant=True, event_type=event_type,
            raw_url=f"https://example.com/news/{i:03d}" if source else "",
        ))

    db.commit()
    return {"ok": True, "companies": len(companies_data), "news": len(all_news)}
