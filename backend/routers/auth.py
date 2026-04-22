from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from database import get_db
import models
import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta

router = APIRouter()

SECRET_KEY = "pms-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# 인증을 요구하지 않는 경로
EXEMPT_PREFIXES = (
    "/auth/login",
    "/users",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def decode_token(token: str):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


async def auth_middleware(request: Request, call_next):
    """모든 요청에 대해 Authorization: Bearer 토큰 검증. 면제 경로(/auth/login, 문서) 및 OPTIONS 제외."""
    path = request.url.path
    if request.method == "OPTIONS" or path == "/" or any(path.startswith(p) for p in EXEMPT_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return JSONResponse({"detail": "인증 토큰이 필요해요."}, status_code=401)
    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except JWTError:
        return JSONResponse({"detail": "토큰이 유효하지 않아요."}, status_code=401)
    request.state.user_payload = payload
    return await call_next(request)


@router.post("/auth/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 틀렸어요.")
    if not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 틀렸어요.")
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "is_org_admin": bool(user.is_org_admin),
        }
    }


@router.get("/auth/me")
def get_me(request: Request, db: Session = Depends(get_db)):
    payload = getattr(request.state, "user_payload", None)
    if not payload:
        raise HTTPException(status_code=401, detail="인증 토큰이 필요해요.")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않아요.")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없어요.")
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_org_admin": bool(user.is_org_admin),
    }
