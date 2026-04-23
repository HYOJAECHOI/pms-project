import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
import models
from routers.activity_logs import extract_user_id, log_activity

router = APIRouter()


def _parse_user_ids(value):
    """콤마구분 문자열 또는 단일 숫자를 int 리스트로 변환. wbs.py의 _parse_ids와 동일 규약."""
    if value is None:
        return None
    raw = str(value).split(',') if not isinstance(value, list) else value
    out = []
    for x in raw:
        s = str(x).strip()
        if not s:
            continue
        try:
            out.append(int(s))
        except ValueError:
            continue
    return out


def _serialize(ins, user_map, receipts_by_instruction):
    receipts = receipts_by_instruction.get(ins.id, [])
    return {
        "id": ins.id,
        "project_id": ins.project_id,
        "wbs_id": ins.wbs_id,
        "author_user_id": ins.author_user_id,
        "author_name": user_map.get(ins.author_user_id),
        "title": ins.title,
        "content": ins.content,
        "priority": ins.priority,
        "created_at": ins.created_at.isoformat() if ins.created_at else None,
        "updated_at": ins.updated_at.isoformat() if ins.updated_at else None,
        "receipts": [
            {
                "id": r.id,
                "target_user_id": r.target_user_id,
                "target_name": user_map.get(r.target_user_id),
                "status": r.status,
                "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "completion_note": r.completion_note,
            }
            for r in receipts
        ],
    }


def _build_user_map(instructions, receipts_by_instruction, db: Session):
    user_ids = set()
    for ins in instructions:
        if ins.author_user_id:
            user_ids.add(ins.author_user_id)
    for rs in receipts_by_instruction.values():
        for r in rs:
            if r.target_user_id:
                user_ids.add(r.target_user_id)
    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name
    return user_map


def _load_receipts(instruction_ids, db: Session):
    out = {}
    if not instruction_ids:
        return out
    rows = (
        db.query(models.WBSInstructionReceipt)
        .filter(models.WBSInstructionReceipt.instruction_id.in_(instruction_ids))
        .all()
    )
    for r in rows:
        out.setdefault(r.instruction_id, []).append(r)
    return out


@router.post("/wbs/{wbs_id}/instructions")
def create_instruction(
    wbs_id: int,
    title: str,
    request: Request,
    content: str = None,
    priority: str = "normal",
    target_user_ids: str = None,  # 콤마구분 문자열
    db: Session = Depends(get_db),
):
    if not title or not title.strip():
        raise HTTPException(status_code=400, detail="제목을 입력해 주세요.")

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    actor_user_id = extract_user_id(request)

    now = datetime.utcnow()
    ins = models.WBSInstruction(
        project_id=wbs.project_id,
        wbs_id=wbs_id,
        author_user_id=actor_user_id,
        title=title,
        content=content,
        priority=priority,
        created_at=now,
        updated_at=now,
    )
    db.add(ins)
    db.flush()  # ins.id 확보

    # Receipt 대상 결정: target_user_ids 우선, 없으면 WBSAssignee 기준
    ids = _parse_user_ids(target_user_ids)
    if not ids:
        ids = [
            r.user_id
            for r in db.query(models.WBSAssignee)
            .filter(models.WBSAssignee.wbs_id == wbs_id)
            .all()
        ]

    # 중복 제거 + 존재하는 user만
    seen = set()
    for uid in ids:
        if uid in seen:
            continue
        seen.add(uid)
        u = db.query(models.User).filter(models.User.id == uid).first()
        if not u:
            continue
        db.add(models.WBSInstructionReceipt(
            instruction_id=ins.id,
            target_user_id=uid,
            status="open",
        ))

    log_activity(
        db,
        project_id=wbs.project_id,
        wbs_id=wbs_id,
        actor_user_id=actor_user_id,
        action_type="instruction_created",
        before_json=None,
        after_json=json.dumps({
            "instruction_id": ins.id,
            "title": title,
            "priority": priority,
            "target_user_ids": list(seen),
        }, ensure_ascii=False),
    )
    db.commit()
    db.refresh(ins)

    receipts_by_instruction = _load_receipts([ins.id], db)
    user_map = _build_user_map([ins], receipts_by_instruction, db)
    return _serialize(ins, user_map, receipts_by_instruction)


@router.get("/my-instructions")
def list_my_instructions(request: Request, db: Session = Depends(get_db)):
    """
    로그인 유저가 수신자로 지정된 활성 지시(open/acknowledged/in_progress) 목록.
    유저 id는 토큰에서 추출 (쿼리 파라미터로 받지 않음 — 다른 유저 조회 방지).
    """
    user_id = extract_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    active_statuses = ["open", "acknowledged", "in_progress"]
    receipts = (
        db.query(models.WBSInstructionReceipt)
        .filter(
            models.WBSInstructionReceipt.target_user_id == user_id,
            models.WBSInstructionReceipt.status.in_(active_statuses),
        )
        .all()
    )
    if not receipts:
        return []

    instruction_ids = list({r.instruction_id for r in receipts})
    instructions = (
        db.query(models.WBSInstruction)
        .filter(models.WBSInstruction.id.in_(instruction_ids))
        .all()
    )
    ins_map = {i.id: i for i in instructions}

    wbs_ids = list({i.wbs_id for i in instructions})
    wbs_rows = db.query(models.WBSItem).filter(models.WBSItem.id.in_(wbs_ids)).all() if wbs_ids else []
    wbs_map = {w.id: w for w in wbs_rows}

    project_ids = list({i.project_id for i in instructions})
    project_rows = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all() if project_ids else []
    project_map = {p.id: p for p in project_rows}

    author_ids = list({i.author_user_id for i in instructions if i.author_user_id})
    author_rows = db.query(models.User).filter(models.User.id.in_(author_ids)).all() if author_ids else []
    author_map = {u.id: u.name for u in author_rows}

    priority_order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    result = []
    for r in receipts:
        ins = ins_map.get(r.instruction_id)
        if not ins:
            continue
        wbs = wbs_map.get(ins.wbs_id)
        proj = project_map.get(ins.project_id)
        result.append({
            "receipt_id": r.id,
            "instruction_id": ins.id,
            "title": ins.title,
            "content": ins.content,
            "priority": ins.priority,
            "author_user_id": ins.author_user_id,
            "author_name": author_map.get(ins.author_user_id),
            "created_at": ins.created_at.isoformat() if ins.created_at else None,
            "status": r.status,
            "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
            "wbs_id": ins.wbs_id,
            "wbs_title": wbs.title if wbs else None,
            "wbs_number": wbs.wbs_number if wbs else None,
            "wbs_level": wbs.level if wbs else None,
            "project_id": ins.project_id,
            "project_name": proj.name if proj else None,
        })

    # 2단계 안정 정렬: 먼저 최신순(created_at desc), 그다음 우선순위 asc
    result.sort(key=lambda x: x["created_at"] or "", reverse=True)
    result.sort(key=lambda x: priority_order.get(x["priority"], 99))
    return result


@router.get("/wbs/{wbs_id}/instructions")
def list_instructions(wbs_id: int, db: Session = Depends(get_db)):
    instructions = (
        db.query(models.WBSInstruction)
        .filter(models.WBSInstruction.wbs_id == wbs_id)
        .order_by(models.WBSInstruction.created_at.desc(), models.WBSInstruction.id.desc())
        .all()
    )
    receipts_by_instruction = _load_receipts([i.id for i in instructions], db)
    user_map = _build_user_map(instructions, receipts_by_instruction, db)
    return [_serialize(ins, user_map, receipts_by_instruction) for ins in instructions]


@router.put("/wbs/instructions/{instruction_id}")
def update_instruction(
    instruction_id: int,
    request: Request,
    title: str = None,
    content: str = None,
    priority: str = None,
    db: Session = Depends(get_db),
):
    ins = db.query(models.WBSInstruction).filter(models.WBSInstruction.id == instruction_id).first()
    if not ins:
        raise HTTPException(status_code=404, detail="지시를 찾을 수 없어요.")

    before = {"title": ins.title, "content": ins.content, "priority": ins.priority}
    changed = False
    if title is not None and title != ins.title:
        ins.title = title
        changed = True
    if content is not None and content != ins.content:
        ins.content = content
        changed = True
    if priority is not None and priority != ins.priority:
        ins.priority = priority
        changed = True

    if changed:
        ins.updated_at = datetime.utcnow()
        log_activity(
            db,
            project_id=ins.project_id,
            wbs_id=ins.wbs_id,
            actor_user_id=extract_user_id(request),
            action_type="instruction_updated",
            before_json=json.dumps(before, ensure_ascii=False),
            after_json=json.dumps({
                "title": ins.title, "content": ins.content, "priority": ins.priority,
            }, ensure_ascii=False),
        )

    db.commit()
    db.refresh(ins)

    receipts_by_instruction = _load_receipts([ins.id], db)
    user_map = _build_user_map([ins], receipts_by_instruction, db)
    return _serialize(ins, user_map, receipts_by_instruction)


@router.delete("/wbs/instructions/{instruction_id}")
def delete_instruction(instruction_id: int, request: Request, db: Session = Depends(get_db)):
    ins = db.query(models.WBSInstruction).filter(models.WBSInstruction.id == instruction_id).first()
    if not ins:
        raise HTTPException(status_code=404, detail="지시를 찾을 수 없어요.")

    db.query(models.WBSInstructionReceipt).filter(
        models.WBSInstructionReceipt.instruction_id == instruction_id
    ).delete(synchronize_session=False)

    log_activity(
        db,
        project_id=ins.project_id,
        wbs_id=ins.wbs_id,
        actor_user_id=extract_user_id(request),
        action_type="instruction_deleted",
        before_json=json.dumps({"instruction_id": instruction_id, "title": ins.title}, ensure_ascii=False),
        after_json=None,
    )

    db.delete(ins)
    db.commit()
    return {"message": "삭제됐어요."}


@router.put("/wbs/instructions/{instruction_id}/receipts/{user_id}")
def update_receipt(
    instruction_id: int,
    user_id: int,
    request: Request,
    status: str = None,
    completion_note: str = None,
    db: Session = Depends(get_db),
):
    caller_id = extract_user_id(request)
    if not caller_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    if caller_id != user_id:
        raise HTTPException(status_code=403, detail="본인의 수신 항목만 변경할 수 있어요.")

    receipt = (
        db.query(models.WBSInstructionReceipt)
        .filter(
            models.WBSInstructionReceipt.instruction_id == instruction_id,
            models.WBSInstructionReceipt.target_user_id == user_id,
        )
        .first()
    )
    if not receipt:
        raise HTTPException(status_code=404, detail="수신 레코드를 찾을 수 없어요.")

    ins = db.query(models.WBSInstruction).filter(models.WBSInstruction.id == instruction_id).first()
    if not ins:
        raise HTTPException(status_code=404, detail="지시를 찾을 수 없어요.")

    before = {"status": receipt.status, "completion_note": receipt.completion_note}
    now = datetime.utcnow()
    changed = False

    if status is not None and status != receipt.status:
        receipt.status = status
        changed = True
        # acknowledged_at: 'acknowledged' 진입 시 세팅, 'open'/'cancelled'로 복귀 시 리셋
        if status == "acknowledged":
            if receipt.acknowledged_at is None:
                receipt.acknowledged_at = now
        elif status in ("open", "cancelled"):
            receipt.acknowledged_at = None
        # completed_at: 'completed' 진입 시 세팅, 그 외 상태로 바뀌면 리셋
        if status == "completed":
            if receipt.completed_at is None:
                receipt.completed_at = now
        else:
            receipt.completed_at = None

    if completion_note is not None and completion_note != receipt.completion_note:
        receipt.completion_note = completion_note
        changed = True

    if changed:
        log_activity(
            db,
            project_id=ins.project_id,
            wbs_id=ins.wbs_id,
            actor_user_id=caller_id,
            action_type="instruction_status_changed",
            before_json=json.dumps(before, ensure_ascii=False),
            after_json=json.dumps({
                "instruction_id": instruction_id,
                "target_user_id": user_id,
                "status": receipt.status,
                "completion_note": receipt.completion_note,
            }, ensure_ascii=False),
        )
        db.commit()
        db.refresh(receipt)
    return {
        "id": receipt.id,
        "instruction_id": receipt.instruction_id,
        "target_user_id": receipt.target_user_id,
        "status": receipt.status,
        "acknowledged_at": receipt.acknowledged_at.isoformat() if receipt.acknowledged_at else None,
        "completed_at": receipt.completed_at.isoformat() if receipt.completed_at else None,
        "completion_note": receipt.completion_note,
    }
