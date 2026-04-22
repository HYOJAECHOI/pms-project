from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import (
    users, projects, members, wbs, organizations, auth, reports,
    project_files, project_comments,
)
from routers.auth import auth_middleware

# 스키마 변경은 Alembic 마이그레이션으로 관리합니다.
#   alembic revision --autogenerate -m "변경내용"
#   alembic upgrade head
# create_all은 마이그레이션이 아직 적용되지 않은 개발 환경(예: 새 체크아웃)에서
# 안전망 역할로 남겨둡니다. 이미 테이블이 있으면 아무 일도 하지 않아요.
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /auth/login과 API 문서를 제외한 모든 요청에 Bearer 토큰 검증
app.middleware("http")(auth_middleware)

app.include_router(users.router)
app.include_router(projects.router)
app.include_router(members.router)
app.include_router(wbs.router)
app.include_router(organizations.router)
app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(project_files.router)
app.include_router(project_comments.router)

@app.get("/")
def read_root():
    return {"message": "PMS 서버 시작!"}