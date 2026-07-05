"""数据库连接与 Session 管理"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

# 启用 SQLite WAL 模式 — 允许并发读写，防止 "database is locked"
if "sqlite" in settings.DATABASE_URL:
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA busy_timeout=5000;")  # 5s 等待而非立即失败
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI 依赖注入：获取数据库 session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库：创建所有表 + 执行轻量迁移"""
    Base.metadata.create_all(bind=engine)

    # 轻量迁移：为 SQLite 已有表添加新列（SQLAlchemy create_all 不会自动修改已有表）
    if "sqlite" in settings.DATABASE_URL:
        _migrate_sqlite()


def _migrate_sqlite():
    """SQLite 增量迁移 — 仅添加缺失的列，不破坏已有数据"""
    import sqlite3
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 获取 companies 表已有列
        cursor.execute("PRAGMA table_info(companies)")
        existing_cols = {row[1] for row in cursor.fetchall()}

        # chain_analysis 列迁移
        if "chain_analysis" not in existing_cols:
            cursor.execute("ALTER TABLE companies ADD COLUMN chain_analysis JSON")
            print("[migrate] companies.chain_analysis 列已添加")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[migrate] SQLite 迁移跳过: {e}")
