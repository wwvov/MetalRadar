"""腾讯云 SCF 函数 URL 入口 — 使用 TestClient 直接调用 FastAPI ASGI 应用

SCF 函数 URL 触发的事件格式与 API Gateway 不同，Mangum 无法识别。
通过 starlette TestClient 直接调用 ASGI 应用，避免事件格式兼容问题。
"""

import json
import logging
import sys
import os

# 确保 /tmp 可写（SCF 临时存储）
os.makedirs("/tmp", exist_ok=True)

# 将 /tmp/.cache 作为缓存目录的替代
CACHE_DIR = "/tmp/.cache"
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ.setdefault("METALRADAR_CACHE_DIR", CACHE_DIR)

# SCF 多实例共用 SQLite 会导致数据不一致（A实例写入的数据B实例看不到）
# 将数据库固定到 /tmp（每个实例独立，但至少保证本实例内数据持久）
# 配合 SCF 最大实例数=1 可以解决多实例问题
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/metalradar.db")

# 确保当前目录在 sys.path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 延迟导入 — 避免模块级别导入在依赖安装完成前失败
_init_db = None


def _ensure_imports():
    """延迟导入：首次调用时加载所有依赖"""
    global _init_db

    if _init_db is not None:
        return

    from app.core.database import init_db as _init_db_func, engine as _engine
    _init_db = _init_db_func

    # 初始化数据库表结构（init_db 内部会导入所有 model 并创建表）
    _init_db_func()
    logger.info(f"SCF 冷启动：数据库表结构已初始化 (DATABASE_URL={_engine.url})")

    # 验证表是否创建成功
    from sqlalchemy import inspect
    inspector = inspect(_engine)
    tables = inspector.get_table_names()
    logger.info(f"SCF 数据库表: {tables}")


def handler(event, context):
    """SCF 函数 URL 入口函数"""
    try:
        return _handle(event, context)
    except Exception as e:
        logger.error(f"Handler 异常: {type(e).__name__}: {e}", exc_info=True)
        import traceback
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"detail": f"{type(e).__name__}: {str(e)}", "traceback": traceback.format_exc()}, ensure_ascii=False),
        }


def _handle(event, context):
    """内部处理函数"""
    _ensure_imports()

    from starlette.testclient import TestClient
    from app.main import app

    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    headers = event.get("headers", {}) or {}
    body = event.get("body", "") or ""
    query_string = event.get("queryString", {}) or {}
    is_base64_encoded = event.get("isBase64Encoded", False)

    # 处理 multipart/form-data
    content_type = headers.get("content-type", headers.get("Content-Type", ""))

    if "multipart/form-data" in content_type:
        # TestClient 不能直接处理 base64 编码的 multipart body
        # 返回提示使用完整 ASGI 处理方式
        # 实际 SCF 环境中，函数 URL 的 body 可能已经是原始字节
        logger.warning(f"multipart/form-data 请求，content-type={content_type}")
        # Fall through to basic handling

    # 构建查询字符串
    qs_parts = []
    for k, v in query_string.items():
        qs_parts.append(f"{k}={v}")
    full_path = path
    if qs_parts:
        full_path += "?" + "&".join(qs_parts)

    logger.info(f"SCF 请求: {http_method} {full_path}")

    try:
        client = TestClient(app, raise_server_exceptions=True)

        # 准备请求头（过滤掉 Host 等可能导致问题的头）
        clean_headers = {}
        for k, v in headers.items():
            kl = k.lower()
            if kl in ("host", "content-length", "transfer-encoding", "connection"):
                continue
            clean_headers[k] = str(v)

        # 确保有 content-type 头
        if "content-type" not in clean_headers and body:
            clean_headers["content-type"] = content_type or "application/json"

        if http_method == "GET":
            response = client.get(full_path, headers=clean_headers)
        elif http_method == "POST":
            if isinstance(body, bytes):
                response = client.post(full_path, content=body, headers=clean_headers)
            elif body:
                try:
                    json_body = json.loads(body)
                    response = client.post(full_path, json=json_body, headers=clean_headers)
                except json.JSONDecodeError:
                    response = client.post(full_path, content=body, headers=clean_headers)
            else:
                response = client.post(full_path, headers=clean_headers)
        elif http_method == "PUT":
            if body:
                try:
                    json_body = json.loads(body)
                    response = client.put(full_path, json=json_body, headers=clean_headers)
                except json.JSONDecodeError:
                    response = client.put(full_path, content=body, headers=clean_headers)
            else:
                response = client.put(full_path, headers=clean_headers)
        elif http_method == "DELETE":
            response = client.delete(full_path, headers=clean_headers)
        else:
            # 尝试通用 request 方法
            response = client.request(http_method, full_path, headers=clean_headers, content=body or None)

        status_code = response.status_code
        response_body = response.content.decode("utf-8", errors="replace") if response.content else ""

        # SCF 函数 URL 集成响应格式
        result = {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
            "body": response_body,
        }

        # 处理非 200 响应
        if status_code >= 400:
            logger.warning(f"SCF 响应 {status_code}: {response_body[:200]}")

        return result

    except Exception as e:
        logger.error(f"SCF 处理异常: {type(e).__name__}: {e}", exc_info=True)
        return {
            "statusCode": 502,
            "headers": {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"detail": f"Internal error: {str(e)}"}, ensure_ascii=False),
        }
