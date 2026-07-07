"""生成 MetalRadar AI Agent 模块架构说明文档 — 文字叙述为主的版本"""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import datetime

doc = Document()

# ── 页面设置 ──
for section in doc.sections:
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

# ── 样式 ──
style = doc.styles['Normal']
style.font.name = '微软雅黑'
style.font.size = Pt(10.5)
style.paragraph_format.line_spacing = 1.5
style.paragraph_format.space_after = Pt(6)
rPr = style.element.get_or_add_rPr()
rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:eastAsia="微软雅黑"/>')
rPr.append(rFonts)


def add_body(text):
    """添加正文段落，带首行缩进"""
    p = doc.add_paragraph(text)
    p.paragraph_format.first_line_indent = Cm(0.74)
    return p


def add_note(text):
    """添加注释/说明文字"""
    p = doc.add_paragraph(text)
    for run in p.runs:
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(100, 100, 100)
    return p


def add_heading_styled(text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = '微软雅黑'
        r = run._element.get_or_add_rPr()
        rf = parse_xml(f'<w:rFonts {nsdecls("w")} w:eastAsia="微软雅黑"/>')
        r.append(rf)
    return h


def set_cell_shading(cell, color):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color}" w:val="clear"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def styled_table(headers, data, col_widths=None):
    """创建标准表格"""
    rows = len(data) + 1
    cols = len(headers)
    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                run.font.bold = True
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(255, 255, 255)
        set_cell_shading(cell, '1a5632')

    for r_idx, row_data in enumerate(data, 1):
        for c_idx, val in enumerate(row_data):
            cell = table.rows[r_idx].cells[c_idx]
            cell.text = str(val) if c_idx < len(row_data) else ''
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(9)
            if r_idx % 2 == 0:
                set_cell_shading(cell, 'f0fdf4')

    if col_widths:
        for i, w in enumerate(col_widths):
            for row in table.rows:
                row.cells[i].width = Cm(w)

    return table


# ═══════════════════════════════════════════════════════════════
# 封面
# ═══════════════════════════════════════════════════════════════
for _ in range(4):
    doc.add_paragraph('')

title_p = doc.add_paragraph()
title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title_p.add_run('MetalRadar · AI Agent 模块')
run.font.size = Pt(26)
run.font.bold = True
run.font.color.rgb = RGBColor(1, 63, 17)

sub_p = doc.add_paragraph()
sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = sub_p.add_run('架构与功能说明')
run.font.size = Pt(16)
run.font.color.rgb = RGBColor(80, 80, 80)

doc.add_paragraph('')
doc.add_paragraph('')

for line in [
    f"日期：{datetime.date.today()}",
    "用途：供撰写结题报告的同学快速了解模块的设计思路、功能全貌与关键实现",
    "范围：Agent 智能对话 · 风险报告生成 · 实时仪表盘",
]:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(line)
    run.font.size = Pt(10.5)
    run.font.color.rgb = RGBColor(80, 80, 80)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════
# 1. 模块概述
# ═══════════════════════════════════════════════════════════════
add_heading_styled('1  模块概述', level=1)

add_body(
    'AI Agent 模块是 MetalRadar 平台的核心交互单元，定位为面向投资者的"AI 投研助手"。'
    '它的核心价值在于将平台上积累的多源数据——包括公司基本面、原材料成本结构、期货实时行情、'
    '行业新闻舆情——通过大语言模型（LLM）整合为自然语言的分析对话和结构化的风险评估报告。'
    '用户无需在多个页面间反复跳转查阅数据，只需在对话中提问或点击"生成报告"，系统就会自动完成从数据采集到推理输出的全链路工作。'
)

add_body(
    '从技术架构上看，Agent 模块采用前后端分离的分层设计。前端基于 React 19 构建了三栏可拖拽的交互界面，'
    '通过 TanStack Query 管理所有异步状态；后端基于 Python FastAPI 提供 RESTful 接口，'
    '以 SQLAlchemy ORM 操作 SQLite 数据库，并通过 OpenAI 兼容协议调用 DeepSeek 大模型完成推理。'
    '数据层整合了 akshare 提供的国内期货实时行情，同时维护了一套本地的公司原材料成本关系统计表。'
)

add_body(
    '下文将从界面设计、功能体系、报告生成机制、评分模型、技术实现和代码组织六个维度逐一展开说明。'
)

doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 2. 界面布局
# ═══════════════════════════════════════════════════════════════
add_heading_styled('2  界面布局', level=1)

add_body(
    'Agent 页面采用了三栏式布局方案，用户打开页面后看到的是一个"左-中-右"的三分区画面。'
    '这种设计借鉴了 Bloomberg Terminal 和 Wind 金融终端的经典布局逻辑：最左侧管理会话和历史记录，'
    '中间是核心交互区，右侧是辅助分析工具面板。三栏之间的分割线支持鼠标拖拽调整宽度，'
    '右侧面板也可以点击折叠按钮完全收起，为主对话区腾出更多空间。'
)

add_heading_styled('2.1  左侧边栏：会话管理', level=2)

add_body(
    '左侧边栏默认宽度 260 像素（可在 200 至 400 像素间拖拽调整），承担了会话管理的全部职责。'
    '用户可以在这里看到所有历史对话的列表，每条以"公司名称 + 创建时间"的格式显示，'
    '便于快速识别和切换。点击某条会话后，中间对话区域会自动加载该会话的全部历史消息，'
    '保持上下文连续性。每个会话条目右侧提供了重命名和删除的快捷按钮。'
    '底部的"新建对话"按钮会基于当前选中的公司名和时间自动生成标题并创建新会话。'
    '所有会话数据都持久化保存在后端的 SQLite 数据库中，即使关闭浏览器也不会丢失。'
)

add_heading_styled('2.2  主对话区：核心交互', level=2)

add_body(
    '中间的主对话区是整个页面的视觉焦点。顶部有一条选择器栏，用户可以从数据库中的公司列表和预设的金属品种列表中勾选分析对象，'
    '支持任意数量的公司、任意数量的金属品种自由组合。选择器下方有三个场景快捷按钮——"风险扫描""事件传导""自由问答"。'
    '前两者点击后会自动在输入框中填充一段专业风格的提示词，引导 LLM 生成更聚焦的分析；自由问答则不预设话题。'
)

add_body(
    '消息渲染方面，用户消息和 AI 回复以聊天气泡的形式展示。AI 回复支持 Markdown 语法（加粗、列表、标题），'
    '并且可以在对话中直接嵌入 ECharts 图表（如价格走势折线图、风险因子饼图等），图表支持点击放大查看。'
    '每条 AI 回复附带风险评分和来源标注，方便用户追溯数据出处。'
)

add_heading_styled('2.3  右侧面板：分析工具', level=2)

add_body(
    '右侧面板默认宽度 420 像素（可在 240 至 520 像素间拖拽），由两个标签页组成。'
    '"仪表盘"标签页下包含四个子面板：公司概览展示所选公司的核心财务指标和产业链位置；'
    '"金属"子面板展示所选金属品种的实时期货行情和加权成本压力指数；'
    '"舆情"子面板展示市场情绪评分、热度趋势和关键词云。'
    '"推荐问题"区域则根据当前选中的公司和金属动态生成可供一键点击的提问模板。'
    '"报告"标签页则呈现生成后的完整风险分析报告，支持 HTML 导出和 PDF 下载。'
)

doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 3. 核心功能
# ═══════════════════════════════════════════════════════════════
add_heading_styled('3  核心功能', level=1)

add_body(
    'Agent 模块的功能设计围绕一条主线展开：让用户以最低的交互成本，完成"提出问题 → 获取分析 → 生成报告"的完整闭环。'
    '以下逐一说明各功能模块的设计思路和实际效果。'
)
doc.add_paragraph('')

# 3.1 智能对话
add_heading_styled('3.1  智能对话', level=2)
add_body(
    '对话系统是整个 Agent 的大脑。它对接 DeepSeek API（使用 OpenAI 兼容协议，支持模型切换），'
    '拥有三种场景模式以适应不同的分析需求。在"风险扫描"模式下，LLM 会围绕五因子模型系统性地评估目标公司/金属'
    '的各类风险并给出数值评分；在"事件传导"模式下，LLM 会梳理近期新闻事件对原材料成本的传导路径；'
    '在"自由问答"模式下，用户可以不受限制地提出任何与金属产业链相关的问题。'
)
add_body(
    '对话上下文的管理值得特别说明：系统会将最近 20 轮的对话历史随每次请求一并发送给 LLM，'
    '使得后续提问可以引用前面的分析结论，形成连贯的多轮推理。当用户切换会话时，历史消息从数据库恢复，'
    '保证了跨访问的连续性。此外，LLM 不可用时系统会自动回退为基于规则模板的兜底提示，'
    '避免因 API 故障导致对话完全中断。'
)

# 3.2 多实体选择
add_heading_styled('3.2  多实体选择', level=2)
add_body(
    '与传统分析工具一次只能看一家公司不同，Agent 模块支持同时选择多家公司和多个金属品种。'
    '公司列表从数据库中的 companies 表加载，包括企业名称、股票代码和所属行业；'
    '金属品种列表是预设的 12 个核心品种（铜、铝、锌、镍、锡、铅、黄金、白银、碳酸锂、工业硅、铁矿石、原油），'
    '涵盖了有色金属、贵金属、新能源材料和工业原料几大类。'
)
add_body(
    '选择的结果会影响两个行为方向：其一，对话时会将所有选中实体的名称注入到发给 LLM 的上下文中，'
    '使得回复能同时覆盖多个分析对象；其二，报告生成时系统会根据选中的实体组合自动路由到对应的报告模式'
    '（详见第 4 章）。用户还可以通过顶部的搜索框快速筛选公司列表，提高操作效率。'
)

# 3.3 仪表盘
add_heading_styled('3.3  仪表盘', level=2)
add_body(
    '仪表盘提供了"一页纵览"的实时数据视图，帮助用户在对话之前快速掌握目标分析对象的基本面。'
    '它由三个子面板组成。公司子面板展示所选企业的核心指标，包括利润规模、营收趋势和股价波动率等（取决于数据库中 financial_reports 表的数据）；'
    '金属子面板通过 akshare 接口拉取所选品种的主力合约实时报价，并综合价格变动和加权成本占比，'
    '生成一个 0 到 100 分的压力温度计指标；舆情子面板则聚合最近 72 小时的关联新闻，'
    '计算市场情绪分、舆情热度变化趋势和出现频率最高的关键词。'
)
add_body(
    '仪表盘的数据通过 /chat/dashboard 接口获取，查询参数支持灵活的实体组合。'
    '前端使用 TanStack Query 管理仪表盘数据的缓存和自动刷新（30 秒旧化时间），保证数据的时效性而非实时性，在准确率和请求频率之间取得平衡。'
)

# 3.4 图表系统
add_heading_styled('3.4  图表系统', level=2)
add_body(
    '图表的渲染统一使用 ECharts（通过 echarts-for-react 封装），支持六种图表类型：柱状图用于展示多品种价格变动对比，'
    '折线图用于展示金属品种近 30 日的价格走势，仪表盘用于展示综合风险评分（0-100 分制），'
    '饼图用于展示五因子对总风险的贡献分布，桑基图用于展示事件传导的上下游路径，'
    '风险分柱状图（score_bar）则是为多公司横向对比专门设计的定制图表类型，按红（≥70）、橙（40-69）、'
    '绿（<40）三段着色。所有图表均支持点击全屏放大查看。'
)

# 3.5 会话管理
add_heading_styled('3.5  会话管理', level=2)
add_body(
    '会话管理实现了完整的 CRUD 操作。每个会话在数据库中存储为一条 chat_sessions 记录，'
    '关联的每轮对话存储为 chat_messages 记录（包含角色、内容、时间戳、关联图表等字段）。'
    '创建会话时系统会根据当前选中的公司和时间自动生成标题；切换会话时前端通过 useSessionDetail hook 拉取历史消息并恢复对话状态；'
    '重命名通过内联编辑实现，删除操作会级联删除关联的消息记录。'
)

# 3.6 辅助功能
add_heading_styled('3.6  辅助功能', level=2)
add_body(
    '除上述核心功能外，系统还提供了一些降低使用门槛的辅助设计。推荐问题模块通过 /chat/recommended 接口，'
    '基于当前选中的实体和最近的对话内容，动态生成 3 到 5 个高相关度的提问模板，一键点击即可填入输入框。'
    '使用手册面板则以内嵌弹窗的形式，向首次使用的用户介绍各种交互方式。'
    '此外输入框的搜索联想功能会根据输入的字符实时过滤公司列表，减少手动查找的成本。'
)

doc.add_paragraph('')

# ── 功能一览表（放在各功能叙述之后，做总结对照用） ──
add_note('下表对上述功能做一个快速对照，便于检索：')

styled_table(
    ['功能模块', '核心能力', '关键数据源'],
    [
        ['智能对话', 'LLM 驱动的多轮推理，三场景切换，20 轮上下文', 'DeepSeek API'],
        ['多实体选择', '任意组合公司和金属品种，影响对话和报告', 'companies 表 + 预设金属列表'],
        ['仪表盘', '公司/金属/舆情数据实时面板，含压力温度计', 'financial_reports、aks share、News 表'],
        ['图表渲染', 'ECharts 六类图表内嵌于对话和报告', '前端 ECharts + 后端 ChartData'],
        ['会话管理', '会话 CRUD，消息持久化，跨会话恢复上下文', 'SQLite chat_sessions + chat_messages'],
        ['辅助功能', '推荐问题、搜索联想、使用手册', 'LLM + 前端状态'],
    ],
    col_widths=[3, 7, 5.5]
)
doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 4. 报告生成机制
# ═══════════════════════════════════════════════════════════════
add_heading_styled('4  报告生成机制', level=1)

add_body(
    '报告生成是 Agent 模块最具产出价值的功能。它不是简单的"把对话内容排版输出"，'
    '而是一个从零开始重新计算、聚合、推理的过程——每次点击"生成报告"，系统都会调用与对话路径独立的计算逻辑，'
    '基于最新的数据库状态和期货行情重新生成一份完整的分析报告。'
    '这套机制根据用户选择的实体组合，自动匹配到三种报告模式。下面先介绍三种模式各自的设计意图和输出内容，'
    '再说明系统如何在前后端完成分发。'
)

# 4.1 单公司模式
add_heading_styled('4.1  单公司模式', level=2)
add_body(
    '当用户只选了 1 家公司、没有选金属品种时，系统生成单公司报告。'
    '这是最初设计的基础模式，专门面向"我想快速看一下这家公司的原材料风险"的场景。'
    '报告的输入是 company_id（来自 companies 表）和 conversation_context（最近 10 轮对话的文本拼接），'
    '不依赖额外的用户配置。'
)
add_body(
    '报告的输出结构分为七个板块：基本信息板块展示了企业的名称、股票代码、行业归属和产业链位置；'
    '行情快照板块展示该公司核心原材料的当前期货价格和 24 小时变动幅度；成本结构板块以表格形式列出'
    '该公司所有关联原材料及其成本占比和影响方向（有利/不利）；风险因子板块展示五因子各自的得分、权重和解释文字；'
    '推理过程板块按"价格面→舆情面→成本传导→综合判定"四个步骤展开分析；'
    '操作建议板块给出 5 条按优先级排列的具体行动建议。'
    '所有输出都以 RiskReport 结构化数据返回，前端通过 ReportPanel 组件渲染。'
)

# 4.2 多公司模式
add_heading_styled('4.2  多公司模式', level=2)
add_body(
    '当用户选了 2 家及以上的公司但没有选金属品种时，系统生成多公司对比报告。这种模式的设计动机是'
    '满足"同一行业的不同企业在同一波原材料价格波动中承受的风险不一样，我需要横向比较"的分析场景。'
    '系统会对每家公司分别调用单公司模式的完整计算逻辑，然后在聚合阶段做跨公司对比。'
)
add_body(
    '多公司报告与单公司报告在输出结构上主要有四点不同。第一，报告标题和摘要包含所有入选公司的名称和各自的风险评分；'
    '第二，增加了"各公司风险评分对比"风险分柱状图，直观呈现风险差异；'
    '第三，联合风险评分不是简单取最高值，而是以最高分 0.6 的权重加平均分 0.4 的权重合成，'
    '这种设计反映了一个判断：组合风险主要由最危险的那个成员驱动，但也不能忽视整体情况；'
    '第四，风险事件做了跨公司去重——同一条新闻如果同时关联了多家公司，只会计数一次，避免信息冗余。'
)

# 4.3 金属聚焦模式
add_heading_styled('4.3  金属聚焦模式', level=2)
add_body(
    '当用户选了金属品种（不论是否同时选了公司），系统生成金属聚焦报告。这种模式是最近一次迭代新增的能力，'
    '专门面向"我想从原材料的视角出发，看看某一类金属的价格波动对哪些下游企业产生了什么影响"。'
    '与公司聚焦模式不同，金属聚焦报告的叙事主体从企业切换到了金属品种。'
)
add_body(
    '金属聚焦报告的生成逻辑包含以下关键步骤。首先，系统以每个选中的金属品种名称为关键词，'
    '通过模糊匹配从 company_materials 表中查询哪些公司的原材料列表里包含该金属（例如"铜"可匹配"电解铜""铜精矿"），'
    '建立起金属到企业的映射关系。然后，对每个匹配到的公司-金属组合，计算该公司对该金属的成本占比、'
    '搜索近 3 天与该金属相关的行业新闻、拉取该金属的期货行情，形成一个独立的风险评估单元。'
    '最后，以金属品种为维度聚合所有公司的风险分，取平均分作为该金属的综合风险分，'
    '再在金属间做加权合成得到最终分数。'
)
add_body(
    '报告的输出在包含标准板块的基础上，增设了两个独特的信息模块。'
    '"金属行情快照"模块用卡片形式展示所有选中金属的期货最新价和 24 小时变动率；'
    '"金属-企业成本暴露表"以表格形式列出每种金属关联了哪些企业、各自成本占比多高、'
    '价格变动方向对企业的成本是利好还是利空。如果某个金属品种在数据库中找不到任何关联公司，'
    '系统会回退到"纯金属模式"，只展示金属自身的价格信息和基本分析，并在推理步骤中提示用户补充企业数据。'
)

# 4.4 分发机制
add_heading_styled('4.4  分发机制', level=2)
add_body(
    '三种报告模式的自动选择由前端和后端各做一次判断，形成双重保险。在前端，handleGenerateReport 函数根据'
    'selectedCompanyIds 和 selectedMaterials 的状态决定传入 generateReport 的参数组合：'
    '纯金属组合只传 materialNames，纯公司组合只传 companyIds，两者均有则同时传递。'
    '在后端，/chat/report 路由接收到请求后，create_report 函数根据参数中是否存在 material_names 和 company_ids 来决定'
    '调用 generate_report 分发器的哪个路径。分发器的判断优先级为：纯金属（有金属无公司）→ '
    '金属+公司（有金属有公司列表）→ 多公司（有多家公司无金属）→ 单公司（兼容旧的 company_id 参数）。'
    '每个分支最终调用对应的内部函数（_generate_metal_focused_report、_generate_company_focused_report、'
    '_generate_single_report 或 _generate_metal_only_report），确保无论参数如何组合都有一条明确的处理路径。'
)

doc.add_paragraph('')

# ── 模式对照表（作为快速参考） ──
add_note('下表对三种报告模式做简要对照：')

styled_table(
    ['报告模式', '触发条件', '核心输入', '关键输出', '典型场景'],
    [
        ['单公司', '仅 1 家公司，未选金属', 'company_id\n对话上下文', '公司概况\n成本结构表\n风险因子 + 推理\n5 条操作建议', '单一企业快速风险评估'],
        ['多公司', '≥2 家公司，未选金属', 'company_ids\n对话上下文', '各公司对比\n风险分柱状图\n去重风险事件\n联合评分', '行业横向比较\n供应链风险扫描'],
        ['金属聚焦', '选中金属品种\n（可附加公司）', 'material_names\ncompany_ids（可选）\n对话上下文', '金属期货行情快照\n金属-企业暴露表\n每个金属的综合风险\n关联行业新闻', '原材料价格波动\n对产业链的冲击分析'],
    ],
    col_widths=[2.5, 3.5, 3, 3.5, 3.5]
)
doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 5. 五因子风险评分模型
# ═══════════════════════════════════════════════════════════════
add_heading_styled('5  五因子风险评分模型', level=1)

add_body(
    '所有报告模式的计算核心都是同一套五因子加权评分体系。它不是由 LLM 凭直觉给分，'
    '而是将风险拆解为五个可量化的维度，每个维度有独立的权重、数据来源和计算方法，加权求和后映射为风险等级。'
    'LLM 的角色是对各因子的得分给出文字描述和解释，而非替代计算逻辑。'
    '以下逐一说明每个因子的设计思路。'
)

add_heading_styled('5.1  舆情风险（权重 40%）', level=2)
add_body(
    '舆情风险在五因子中占据最高的权重，这源于一个基本假设：对于金属这类大宗商品，'
    '市场情绪和突发新闻是短期内影响价格波动的最重要因素。舆情的计算基于 News 表中近三天的关联新闻，'
    '通过统计负面情绪（emotion = "negative"）新闻在全部相关新闻中的占比，并乘以情绪强度系数（由 LLM 评估），'
    '归一化到 0 到 100 分。分值越高表示负面舆情越集中，市场恐慌情绪越强。'
)

add_heading_styled('5.2  价格波动（权重 25%）', level=2)
add_body(
    '价格波动因子衡量的是标的金属品种近期的市场波动幅度。数据来源是 akshare 提供的期货近 30 日收盘价序列，'
    '计算方式是先求出日收益率序列，再计算其年化波动率（日标准差乘以根号 252），最后将波动率归一化到 0 到 100 分。'
    '这一归一化操作的关键在于刻度：不是直接用百分比作为分数，而是将波动率映射在"行业常规波动范围"的区间上，'
    '使得跨品种（如波动天然较大的碳酸锂与波动相对温和的铜）的评分具有可比性。'
)

add_heading_styled('5.3  成本暴露（权重 20%）', level=2)
add_body(
    '成本暴露评估的是目标金属在目标企业的原材料成本结构中所占的比重，以及价格变动方向对企业利润的影响。'
    '数据来自 company_materials 表，该表记录了每家企业每种原材料的成本占比（cost_pct）、'
    '价格基准来源（source）和价格变动的利好/利空方向（direction）。'
    '成本占比越高的品种，其价格波动对企业盈利的冲击越大，相应的风险分也越高。'
)

add_heading_styled('5.4  宏观环境（权重 10%）', level=2)
add_body(
    '宏观环境因子是五个因子中相对"软性"的一个，主要依赖 LLM 对当前宏观背景的理解。'
    '系统会将对话上下文和当前日期一并发送给 LLM，由它评估当前所处的宏观经济阶段'
    '（如全球加息周期、供应链重构期、地缘冲突期等）对金属产业链的风险程度，给出一个 0 到 100 的评分。'
    '虽然占比较低，但在宏观剧变的时期（如重大政策发布、战争爆发），这个因子可以起到关键的预警作用。'
)

add_heading_styled('5.5  汇率风险（权重 5%）', level=2)
add_body(
    '汇率风险因子专门评估以进口为主的金属品种（如铁矿石、铜精矿）对汇率波动的敏感度。'
    'LLM 根据企业的产业链位置和主要金属品种的进口依赖程度，评估汇率变动对原材料采购成本的影响幅度。'
    '权重仅 5% 是因为在正常情况下汇率波动较为温和，但在人民币出现剧烈波动时，这一因子的重要性会显著上升。'
    '系统中保留了未来将这一权重设为动态可调的空间。'
)

add_heading_styled('5.6  等级映射与总分合成', level=2)
add_body(
    '五个因子的加权总分直接映射为三个风险等级：70 分及以上为"高风险"，前端以红色标识；'
    '40 至 69 分为"中等风险"，以橙色标识；40 分以下为"低风险"，以绿色标识。'
    '这一阈值的设定参考了金融行业常见的三色预警体系，同时考虑到金属原材料风险通常以中等风险为主——'
    '因为大宗商品本身就伴随周期性波动，降到"低风险"的门槛相对较低。'
)

add_note('五因子模型参数速览：')

styled_table(
    ['因子', '权重', '数据来源', '计分说明'],
    [
        ['舆情风险', '40%', 'News 表近 3 天关联新闻', '负面新闻占比 × LLM 情绪强度系数，归一化 0-100'],
        ['价格波动', '25%', 'aks share 期货 30 日收盘价', '日收益率年化波动率，归一化 0-100'],
        ['成本暴露', '20%', 'CompanyMaterial 表', '最大原材料成本占比 × 价格方向折扣'],
        ['宏观环境', '10%', 'LLM 分析', '基于对话上下文评估宏观经济风险程度 0-100'],
        ['汇率风险', '5%', 'LLM 评估', '进口依赖度 × 汇率波动预期 0-100'],
    ],
    col_widths=[2.5, 1.5, 4.5, 7]
)
doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 6. 技术实现
# ═══════════════════════════════════════════════════════════════
add_heading_styled('6  技术实现', level=1)

add_body(
    'Agent 模块的技术选型遵循了两个原则：一是尽量复用团队已掌握的技术栈（React、Python、SQLite），'
    '降低协作和维护成本；二是使用成熟的开源方案（ECharts、DeepSeek API、akshare）而不是自研底层组件，'
    '把精力集中在业务逻辑和交互设计上。下面从前后端两端分别说明技术选择和关键设计。'
)

add_heading_styled('6.1  前端', level=2)
add_body(
    '前端基于 React 19 + TypeScript + Vite 构建。选择 Vite 而非 Create React App 的原因是它的开发服务器启动速度和热更新性能远优于后者，'
    '对于频繁修改 UI 的迭代阶段非常友好。样式体系使用 TailwindCSS v4 搭配 shadcn/ui 组件库，'
    'TailwindCSS 的 utility-first 模式让组件样式和逻辑可以写在同一文件中，'
    'shadcn/ui 则提供了一套语义化、可定制的基础组件（按钮、下拉框、对话框等），避免了从零写的重复劳动。'
    '图表渲染通过 echarts-for-react 将 ECharts 封装为 React 组件，利用 ReactEChartsCore 的 option 驱动模式，'
    '使得从后端返回的 ChartData JSON 可以几乎零处理地渲染为图表。'
)
add_body(
    '前端的状态管理采用了轻量化方案，没有引入 Redux 或 Zustand。页面级的核心状态（选中的公司/金属、'
    '当前会话 ID、对话内容）通过 useState 在 AgentPage 组件中维护，传递给子组件。'
    '所有与服务端的异步数据交互（对话、报告、仪表盘、会话列表）统一通过 TanStack Query 的 useQuery 和 useMutation 管理，'
    '天然获得了缓存、自动刷新、加载状态和错误处理的能力。'
)

add_heading_styled('6.2  后端', level=2)
add_body(
    '后端基于 Python FastAPI 构建，提供了 7 个 RESTful 接口（详见 6.3 节）。FastAPI 的自动 OpenAPI 文档生成和 Pydantic 模型校验，'
    '让前后端的数据契约始终清晰可追溯。数据库使用 SQLite + SQLAlchemy ORM，'
    'SQLite 的零配置特点和文件级可移植性非常适合课程项目的协作场景——同学们只需拷贝 .db 文件即可共享全部数据。'
    'SQLAlchemy 的 session 管理采用函数内手动 open/close 模式（而非 FastAPI 的依赖注入），'
    '这是为了避免在 ThreadPoolExecutor 中执行期货数据请求时的 session 跨线程问题。'
)
add_body(
    'AI 推理层通过 OpenAI 兼容协议调用 DeepSeek API，配置一个 base_url 和 api_key 即可切换模型。'
    '为应对 LLM 不可用或超时的情况，报告生成中的文本摘要和上下文分析均设计了兜底逻辑：'
    'LLM 调用失败时返回空字典，由后续步骤使用模板化文字填充。'
    '期货行情数据通过 akshare 的 futures_zh_spot 和 futures_main_sina 接口获取，'
    '封装在独立的 futures_service 模块中，通过 _run_with_timeout 函数控制超时（默认 5 秒），'
    '避免因外部数据源不可用而阻塞整个报告生成流程。'
)

add_heading_styled('6.3  API 接口', level=2)
add_body(
    'Agent 模块共对外暴露 7 个 HTTP 接口，均挂载在 /chat 路径前缀下。核心接口 /chat 接收对话消息，'
    '返回包含文字回复、图表数据和风险评分的结构化响应。报告接口 /chat/report 支持三种模式的分发（通过参数组合），'
    '/chat/report/pdf 接口则将报告转换为 PDF 二进制流供下载。仪表盘接口 /chat/dashboard 通过查询参数支持'
    '灵活的公司/金属组合和子面板切换。会话管理通过标准的 RESTful 路径 /chat/sessions 实现了完整的 CRUD。'
)

styled_table(
    ['接口路径', '方法', '核心功能'],
    [
        ['/chat', 'POST', '发送对话消息，返回 AI 回复 + 图表列表 + 风险评分'],
        ['/chat/report', 'POST', '生成风险分析报告（支持单公司/多公司/金属聚焦三种模式）'],
        ['/chat/report/pdf', 'POST', '将已生成的报告导出为 PDF 文件'],
        ['/chat/dashboard', 'GET', '获取仪表盘数据（通过 tab 参数切换公司/金属/舆情子面板）'],
        ['/chat/recommended', 'GET', '根据当前上下文返回推荐提问列表'],
        ['/chat/sessions', 'GET / POST', '查询会话列表或创建新会话'],
        ['/chat/sessions/{id}', 'GET / PUT / DELETE', '获取会话详情 / 重命名 / 删除'],
    ],
    col_widths=[4, 3, 9.5]
)
doc.add_paragraph('')

# ═══════════════════════════════════════════════════════════════
# 7. 代码组织
# ═══════════════════════════════════════════════════════════════
add_heading_styled('7  关键代码文件', level=1)

add_body(
    'Agent 模块的代码分布在前后端共 8 个核心文件中。理解它们各自的职责和相互关系，'
    '是阅读和维护这套代码的前提。下面对每个文件做一个简要的角色说明。'
)

add_heading_styled('7.1  backend/app/services/agent_service.py', level=2)
add_body(
    '这是整个模块体量最大的文件，承载了全部业务逻辑。包含一个主入口函数 generate_report（报告分发的路由器）'
    '和五个子生成函数：_generate_single_report（单公司）、_generate_company_focused_report（多公司对比）、'
    '_generate_metal_focused_report（金属聚焦）、_generate_metal_only_report（纯金属，无关联公司的回退）。'
    '此外还有 process_chat（对话处理）、_compute_risk（五因子评分引擎）、_summarize_conversation_context'
    '（LLM 对话摘要）、_find_companies_by_materials（金属到公司的模糊匹配查询）等辅助函数。'
    '会话管理函数（create_session、list_sessions 等）、PDF 导出函数 generate_pdf_report 和分享功能 share_report 也在此文件中。'
)

add_heading_styled('7.2  backend/app/api/chat.py', level=2)
add_body(
    '定义了所有 Agent 相关的 API 路由，共 7 个端点。每个端点的职责很薄——只做参数校验、调用 agent_service 中的对应函数、'
    '处理异常并返回 HTTP 响应。create_report 端点中包含了报告模式的第一级分发逻辑，'
    '根据请求体中有无 material_names 和 company_ids 决定如何调用 generate_report。'
)

add_heading_styled('7.3  backend/app/schemas/chat.py', level=2)
add_body(
    'Pydantic 数据模型定义文件。ChartData 定义了六种图表类型（line、bar、gauge、pie、flow、score_bar）的统一结构；'
    'RiskReport 定义了报告的所有字段，包括 reasoning（推理步骤列表）、factors（风险因子列表）、'
    'recommendations（操作建议列表）、metal_quotes 和 metal_exposures（金属分析特有的字段）等。'
    'ReportGenerateRequest 是报告生成接口的请求模型，支持 company_id、company_ids、material_names 和 conversation_context 四个可选参数。'
)

add_heading_styled('7.4  frontend/src/pages/AgentPage.tsx', level=2)
add_body(
    '前端最核心的页面文件，约 1600 行。集中了 Agent 页面的全部 UI 逻辑：三栏布局、拖拽调整、'
    '对话渲染（SimpleMarkdown 组件 + ChartRenderer 组件 + ChartModal 全屏组件）、'
    '仪表盘面板（DashboardPanel）、报告面板（ReportPanel）、使用手册（HelpPanel）、'
    '报告导出（HTML 构建 + 文件下载）等。状态管理都在此文件中通过 useState 完成，不依赖外部状态库。'
)

add_heading_styled('7.5  frontend/src/hooks/useAgent.ts', level=2)
add_body(
    'React Hooks 集合。useAgent 管理对话消息的状态和 sendMessage 的副作用；'
    'useReport 封装了报告生成的 useMutation，并对外暴露 loading 和 error 状态；'
    'useSessions、useSessionDetail 管理会话数据，useDashboard 和 useRecommended 分别管理仪表盘和推荐问题的查询。'
)

add_heading_styled('7.6  frontend/src/services/agentService.ts', level=2)
add_body(
    'axios HTTP 客户端封装层。每个 API 接口在此文件中映射为一个函数，统一处理 base URL、超时设置和响应类型转换。'
)

add_heading_styled('7.7  frontend/src/types/agent.ts', level=2)
add_body(
    'TypeScript 类型定义文件。与后端的 Pydantic 模型一一对应，确保前后端数据结构的一致性。'
    '定义了 ChatMessageItem、ChatRequest、ChatResponse、RiskReport、ChartData 等核心类型。'
)

add_heading_styled('7.8  backend/app/services/futures_service.py', level=2)
add_body(
    '独立的期货行情服务模块，封装了 akshare 的调用逻辑。get_futures_quote 获取主力合约的实时报价，'
    'get_futures_history 按天数拉取历史收盘价序列。使用金属品种中文名到期货合约代码的映射表做转换。'
    '该模块独立于 agent_service，可以被其他模块（如新闻页面的行情组件）复用。'
)

doc.add_paragraph('')

# ── 文件总览表 ──
add_note('文件职责一览：')

styled_table(
    ['文件路径', '类型', '一句话职责'],
    [
        ['backend/app/services/agent_service.py', '后端逻辑', '全部核心业务：对话、报告、评分、会话、PDF/分享'],
        ['backend/app/api/chat.py', 'API 路由', '7 个 REST 端点，薄层，参数校验 + 调用服务'],
        ['backend/app/schemas/chat.py', '数据模型', 'Pydantic ChartData / RiskReport / ReportGenerateRequest'],
        ['frontend/src/pages/AgentPage.tsx', '前端页面', 'Agent 页面的全部 UI 和交互逻辑（~1600 行）'],
        ['frontend/src/hooks/useAgent.ts', '状态管理', 'TanStack Query hooks：对话、报告、会话、仪表盘'],
        ['frontend/src/services/agentService.ts', 'HTTP 封装', 'axios 实例，映射所有 API 函数'],
        ['frontend/src/types/agent.ts', '类型定义', 'TS 接口与后端 Pydantic 模型对齐'],
        ['backend/app/services/futures_service.py', '数据服务', 'aks share 期货行情封装，可独立复用'],
    ],
    col_widths=[6, 2.5, 8]
)

# ── 保存 ──
output_path = 'D:/MetalRadar/MetalRadar_Agent_架构与功能说明.docx'
doc.save(output_path)
print(f'Document saved: {output_path}')
