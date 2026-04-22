from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from database import get_db
import models

router = APIRouter()


def _serialize(reports, db: Session):
    result = []
    for r in reports:
        requester = db.query(models.User).filter(models.User.id == r.requester_id).first()
        wbs = db.query(models.WBSItem).filter(models.WBSItem.id == r.wbs_id).first()
        project = db.query(models.Project).filter(models.Project.id == r.project_id).first()
        result.append({
            "id": r.id,
            "wbs_id": r.wbs_id,
            "wbs_number": wbs.wbs_number if wbs else None,
            "wbs_title": wbs.title if wbs else None,
            "requester_id": r.requester_id,
            "requester_name": requester.name if requester else None,
            "project_id": r.project_id,
            "project_name": project.name if project else None,
            "report_type": r.report_type,
            "current_progress": r.current_progress,
            "requested_progress": r.requested_progress,
            "current_end_date": str(r.current_end_date) if r.current_end_date else None,
            "requested_end_date": str(r.requested_end_date) if r.requested_end_date else None,
            "memo": r.memo,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "pm_comment": r.pm_comment,
        })
    return result


# 보고 생성 (컨설턴트가 요청)
@router.post("/reports")
def create_report(
    wbs_id: int,
    requester_id: int,
    report_type: str,
    project_id: int = None,
    current_progress: float = None,
    requested_progress: float = None,
    current_end_date: date = None,
    requested_end_date: date = None,
    memo: str = None,
    db: Session = Depends(get_db),
):
    if report_type not in ("진척보고", "일정조정", "완료보고"):
        raise HTTPException(status_code=400, detail="report_type이 올바르지 않아요.")

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    requester = db.query(models.User).filter(models.User.id == requester_id).first()
    if not requester:
        raise HTTPException(status_code=404, detail="요청자를 찾을 수 없어요.")

    report = models.WorkReport(
        wbs_id=wbs_id,
        requester_id=requester_id,
        project_id=project_id if project_id is not None else wbs.project_id,
        report_type=report_type,
        current_progress=current_progress,
        requested_progress=requested_progress,
        current_end_date=current_end_date,
        requested_end_date=requested_end_date,
        memo=memo,
        status="대기",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _serialize([report], db)[0]


# 내가 요청한 보고 목록
@router.get("/reports/my")
def get_my_reports(user_id: int, db: Session = Depends(get_db)):
    reports = (
        db.query(models.WorkReport)
        .filter(models.WorkReport.requester_id == user_id)
        .order_by(models.WorkReport.created_at.desc())
        .all()
    )
    return _serialize(reports, db)


# PM이 볼 프로젝트 보고 목록
@router.get("/reports/pm")
def get_pm_reports(project_id: int, db: Session = Depends(get_db)):
    reports = (
        db.query(models.WorkReport)
        .filter(models.WorkReport.project_id == project_id)
        .order_by(models.WorkReport.created_at.desc())
        .all()
    )
    return _serialize(reports, db)


# 승인 (WBS 자동 업데이트)
@router.put("/reports/{report_id}/approve")
def approve_report(report_id: int, pm_comment: str = None, db: Session = Depends(get_db)):
    report = db.query(models.WorkReport).filter(models.WorkReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="보고를 찾을 수 없어요.")
    if report.status != "대기":
        raise HTTPException(status_code=400, detail="이미 처리된 보고예요.")

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == report.wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    changes = []
    if report.report_type == "진척보고":
        if report.requested_progress is not None:
            changes.append(f"actual_progress {wbs.actual_progress} → {report.requested_progress}")
            wbs.actual_progress = report.requested_progress
            if wbs.actual_progress > 0 and wbs.status == "대기":
                changes.append("status 대기 → 진행중")
                wbs.status = "진행중"
            if wbs.actual_start_date is None:
                wbs.actual_start_date = date.today()
                changes.append(f"actual_start_date → {wbs.actual_start_date}")
    elif report.report_type == "일정조정":
        if report.requested_end_date is not None:
            changes.append(f"plan_end_date {wbs.plan_end_date} → {report.requested_end_date}")
            wbs.plan_end_date = report.requested_end_date
    elif report.report_type == "완료보고":
        changes.append(f"status {wbs.status} → 완료")
        wbs.status = "완료"
        changes.append(f"actual_progress {wbs.actual_progress} → 1.0")
        wbs.actual_progress = 1.0
        if wbs.actual_start_date is None:
            wbs.actual_start_date = date.today()
            changes.append(f"actual_start_date → {wbs.actual_start_date}")
        new_end = report.requested_end_date or date.today()
        changes.append(f"actual_end_date {wbs.actual_end_date} → {new_end}")
        wbs.actual_end_date = new_end

    report.status = "승인"
    if pm_comment is not None:
        report.pm_comment = pm_comment

    print(
        f"[approve_report] report_id={report.id} type={report.report_type} "
        f"wbs_id={wbs.id}({wbs.wbs_number} {wbs.title}) "
        f"requester_id={report.requester_id} pm_comment={pm_comment!r} "
        f"changes=[{', '.join(changes) if changes else '없음'}]",
        flush=True,
    )

    db.commit()
    db.refresh(report)
    return _serialize([report], db)[0]


# 반려 (pm_comment 포함)
@router.put("/reports/{report_id}/reject")
def reject_report(report_id: int, pm_comment: str, db: Session = Depends(get_db)):
    report = db.query(models.WorkReport).filter(models.WorkReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="보고를 찾을 수 없어요.")
    if report.status != "대기":
        raise HTTPException(status_code=400, detail="이미 처리된 보고예요.")

    report.status = "반려"
    report.pm_comment = pm_comment

    db.commit()
    db.refresh(report)
    return _serialize([report], db)[0]
