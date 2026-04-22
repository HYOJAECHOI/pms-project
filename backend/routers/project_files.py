import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter()

UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")


def _project_dir(project_id: int) -> str:
    path = os.path.join(UPLOAD_ROOT, f"project_{project_id}")
    os.makedirs(path, exist_ok=True)
    return path


@router.post("/projects/{project_id}/files")
def upload_project_file(
    project_id: int,
    uploaded_by: int = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    project_dir = _project_dir(project_id)
    safe_name = os.path.basename(file.filename or "untitled")
    target_path = os.path.join(project_dir, safe_name)

    # 동일 이름 파일이 있으면 (1), (2)... 형태로 번호 붙이기
    base, ext = os.path.splitext(safe_name)
    counter = 1
    while os.path.exists(target_path):
        target_path = os.path.join(project_dir, f"{base} ({counter}){ext}")
        counter += 1

    with open(target_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    filesize = os.path.getsize(target_path)

    record = models.ProjectFile(
        project_id=project_id,
        filename=os.path.basename(target_path),
        filepath=target_path,
        filesize=filesize,
        uploaded_by=uploaded_by,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "project_id": record.project_id,
        "filename": record.filename,
        "filepath": record.filepath,
        "filesize": record.filesize,
        "uploaded_by": record.uploaded_by,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/projects/{project_id}/files")
def list_project_files(project_id: int, db: Session = Depends(get_db)):
    files = (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project_id)
        .order_by(models.ProjectFile.created_at.desc())
        .all()
    )
    user_ids = {f.uploaded_by for f in files if f.uploaded_by}
    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name
    return [
        {
            "id": f.id,
            "project_id": f.project_id,
            "filename": f.filename,
            "filepath": f.filepath,
            "filesize": f.filesize,
            "uploaded_by": f.uploaded_by,
            "uploaded_by_name": user_map.get(f.uploaded_by),
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


@router.delete("/projects/files/{file_id}")
def delete_project_file(file_id: int, db: Session = Depends(get_db)):
    record = db.query(models.ProjectFile).filter(models.ProjectFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    if record.filepath and os.path.exists(record.filepath):
        try:
            os.remove(record.filepath)
        except OSError:
            pass
    db.delete(record)
    db.commit()
    return {"message": "파일이 삭제됐어요."}
