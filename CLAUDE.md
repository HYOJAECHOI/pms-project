# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# PMS 프로젝트 (Project Management System)

## 기술 스택
- 백엔드: Python FastAPI + SQLite + SQLAlchemy, JWT 인증 (python-jose + bcrypt)
- 프론트엔드: React 19 + Ant Design 6 + React Router 7, axios, @dnd-kit (WBS 드래그), xlsx/file-saver (엑셀 내보내기)
- 한국어 UI / 한국어 에러 메시지

## 서버 실행
- 백엔드: `cd backend && venv\Scripts\activate && uvicorn main:app --reload` → http://127.0.0.1:8000
- 프론트엔드: `cd frontend && npm start` → http://localhost:3000
- API 자동 문서: http://127.0.0.1:8000/docs (Swagger UI)
- DB 파일: `backend/pms.db` (SQLite). 스키마는 **Alembic 마이그레이션**으로 관리 (`backend/alembic/`)

## DB 마이그레이션 (Alembic)
스키마 변경은 반드시 Alembic으로 처리. `pms.db` 파일을 직접 지우거나 `create_all`에 의존하지 말 것.

- **모델 변경 → 마이그레이션 생성**:
  ```
  cd backend && venv\Scripts\activate
  alembic revision --autogenerate -m "변경내용"
  alembic upgrade head
  ```
- 처음 체크아웃해서 `pms.db`가 없는 경우에도 `alembic upgrade head` 한 번으로 스키마 생성
- 설정: `backend/alembic.ini`(`sqlalchemy.url = sqlite:///./pms.db`), `backend/alembic/env.py`가 `database.py`의 `engine`과 `models.py`의 `Base.metadata` 사용. SQLite의 제한된 `ALTER TABLE`을 우회하기 위해 `render_as_batch=True` 설정됨
- 자동생성 후에는 반드시 `backend/alembic/versions/*.py` 파일을 **리뷰**하고, 데이터 이전이 필요한 컬럼 변경은 수동 수정
- 롤백: `alembic downgrade -1`

## 테스트 / 빌드 (프론트엔드)
- 전체 테스트: `cd frontend && npm test`
- 단일 테스트: `npm test -- --testPathPattern=파일명` 또는 watch 모드에서 `p` 후 파일명
- 프로덕션 빌드: `npm run build`
- 백엔드에는 테스트 스위트가 아직 없음

## 아키텍처 요약

### 백엔드 API 스타일 (중요)
- **엔드포인트 파라미터는 JSON 바디가 아니라 쿼리 파라미터로 받는다.** (`def create_project(name: str, description: str = "", ...)`) → 프론트에서 `api.post('/projects', null, { params: {...} })` 형태로 호출해야 함. 새 엔드포인트도 이 규칙을 따를 것.
- Pydantic 스키마 없이 SQLAlchemy 모델 인스턴스를 그대로 반환. 관계 데이터(예: 담당자 이름)가 필요하면 핸들러에서 직접 조인/조회해 dict로 조립 (`routers/wbs.py`의 `get_wbs` 참고).
- `get_db()` 헬퍼가 `database.py`에 있지만 각 라우터에서 중복 정의되어 있음. 새 라우터를 만들 때는 `from database import get_db`를 재사용할 것.
- `main.py`에서 라우터를 `app.include_router(...)`로 명시적으로 등록해야 함.

### 인증
- `/auth/login`이 JWT 발급 (HS256, 24시간, `SECRET_KEY`는 `routers/auth.py`에 하드코딩 — 운영 전 교체 필요).
- 프론트는 `localStorage`에 `token`과 `user`를 저장. `src/api/axios.js`가 모든 요청에 `Authorization: Bearer ...`를 붙이고, 401 응답 시 스토리지를 비우고 `/`로 강제 이동.
- 현재 대부분의 백엔드 엔드포인트는 토큰 검증을 강제하지 않음(무방비). 권한/역할 체크를 추가할 때는 프론트뿐 아니라 백엔드에도 의존성 주입해야 함.

### 역할 체계 (옵션 A — 3축 분리)
역할은 서로 다른 3개 축으로 관리. 섞어서 쓰지 말 것.

- **system role** (`User.role`, 3가지): `admin` / `manager` / `user`
  - `admin`: 전체 관리 (유저/조직 관리, 모든 보고 검토 가능)
  - `manager`: 검토 권한 (본인이 PM인 프로젝트의 보고 검토)
  - `user`: 일반 사용자
  - 프론트 표시 라벨: `admin→관리자` / `manager→매니저` / `user→일반`
- **position** (`User.position`, 직위): `사장` / `부사장` / `본부장` / `이사` / `수석` / `책임` / `대리` / `사원` / `연구원`
- **project role** (`ProjectMember.project_role`, 4가지): `PM` / `PL` / `PAO` / `Member`
  - 프로젝트별로 다를 수 있음. PM 여부는 `ProjectMember.project_role === 'PM'`로 판정 (legacy `Project.pm_id`와 동기화)
  - `/projects/{id}/members` 엔드포인트가 `pm_id`를 PM 멤버로 합쳐 반환함

**금지**: `pm` / `director` / `executive` / `member`를 `User.role`에 쓰지 말 것(legacy). 프로젝트 내 역할은 전부 `project_role` 축으로.

### 도메인 모델 (`backend/models.py`)
- `Organization`: 자기참조 `parent_id`로 조직 계층 표현.
- `User`: `organization_id`로 조직 소속, `role`로 권한.
- `Project`: `status`는 한국어 enum 문자열 `제안` / `수행` / `종료`, `pm_id`로 담당 PM 연결.
- `ProjectMember`: Project ↔ User 다대다.
- `WBSItem`: 자기참조 `parent_id`로 4단계 트리(`level` 1~4), `wbs_number`는 `"1.2.3"` 형태 문자열(정렬 키로 사용), `status`는 한국어 `대기`/`진행중`/`완료`. 계획/실적 시작·종료일과 진척률(`plan_progress`/`actual_progress`), 가중치(`weight`), 산출물(`deliverable`) 포함.

### 프론트엔드 구조
- `App.js`가 `localStorage` 토큰 유무로 로그인/메인 렌더 분기. 라우팅 트리 전체를 `AppLayout`(사이드바+헤더 고정)이 감싸므로 **페이지 컴포넌트는 `<Layout>`/`<Content>` 없이 `<>...</>` fragment만 반환**할 것.
- API 호출은 반드시 `src/api/axios.js`의 기본 인스턴스 사용 (baseURL, 토큰 주입, 401 처리 일원화).
- 주요 화면: `Dashboard`, `ProjectList/Create/Detail/Edit/Members`, `GanttChart`, `MyTasks`, `Login`. WBS 편집·드래그는 `ProjectDetail` 주변에서 `@dnd-kit`으로 구현.
- 공통 컴포넌트는 `src/components/` (현재 `AppLayout.js`만). 사이드바 메뉴 추가 시 `menuItems` 배열에 라우트 키/아이콘 추가 + `App.js`에 `<Route>` 등록.

## 개발 시 주의
- 문자열 상태 값은 모두 한국어 리터럴이므로 백엔드/프론트 양쪽을 동일하게 맞춰야 함 (`제안`/`수행`/`종료`, `대기`/`진행중`/`완료`).
- 새 WBS 필드를 추가하면 `models.py`, `routers/wbs.py`의 create/update 쿼리 파라미터, `get_wbs`의 응답 dict, 프론트 입력/표시 세 군데를 모두 동기화해야 함.
- 스키마 변경 시 Alembic 마이그레이션을 생성해 적용 (상단 "DB 마이그레이션" 섹션 참고). `pms.db`를 수동으로 지우거나 `create_all`에 의존하지 말 것.

## 에이전트 역할 분담
- 기획/설계/분해: Claude (claude.ai) - 방향 결정
- 실제 코드 수정: Claude Code (VS Code PowerShell)
- 보조 구현/검증: Codex (WSL Ubuntu 터미널)

## Codex 작업 원칙
- 반드시 작은 단위로 작업
- Allowed files 명시 필수
- 작업 전 파악 먼저, 완료 후 변경 파일 목록 출력

## 작업 전 체크리스트 (필수)
- 변경할 파일 목록 먼저 출력
- DB 변경이면 alembic 필요 여부 확인
- 영향받는 다른 파일 확인
- 작업 완료 후 변경 요약 출력
