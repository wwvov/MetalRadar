"""用户相关 API — 关注列表管理"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import company_service
from app.schemas.company import CompanyBasic

router = APIRouter(prefix="/user", tags=["用户"])

DEFAULT_USER = "default"


class FollowBody(BaseModel):
    company_id: str


@router.get("/follows", response_model=list[CompanyBasic])
def get_follows(db: Session = Depends(get_db)):
    """获取用户关注的公司列表"""
    return company_service.get_user_follows(db, DEFAULT_USER)


@router.post("/follows")
def follow_company(body: FollowBody, db: Session = Depends(get_db)):
    """关注公司"""
    company_service.follow_company(db, DEFAULT_USER, body.company_id)
    return {"ok": True}


@router.delete("/follows/{company_id}")
def unfollow_company(company_id: str, db: Session = Depends(get_db)):
    """取消关注公司"""
    company_service.unfollow_company(db, DEFAULT_USER, company_id)
    return {"ok": True}
