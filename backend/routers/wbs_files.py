import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter()

UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")


def _wbs_dir(wbs_id: int) -> str:
    path = os.path.join(UPLOAD_ROOT, f"wbs_{wbs_id}")
    os.makedirs(path, exist_ok=True)
    return path


def _serialize(f: models.WBSFile, user_map: dict) -> dict:
    return {
        "id": f.id,
        "wbs_id": f.wbs_id,
        "project_id": f.project_id,
        "filename": f.filename,
        "filepath": f.filepath,
        "filesize": f.filesize,
        "uploaded_by": f.uploaded_by,
        "uploaded_by_name": user_map.get(f.uploaded_by) if user_map else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


@router.post("/wbs/{wbs_id}/files")
def upload_wbs_file(
    wbs_id: int,
    uploaded_by: int = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    wbs_dir = _wbs_dir(wbs_id)
    safe_name = os.path.basename(file.filename or "untitled")
    target_path = os.path.join(wbs_dir, safe_name)

    # 동일 이름이면 (1), (2)... 형태로
    base, ext = os.path.splitext(safe_name)
    counter = 1
    while os.path.exists(target_path):
        target_path = os.path.join(wbs_dir, f"{base} ({counter}){ext}")
        counter += 1

    with open(target_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    filesize = os.path.getsize(target_path)

    record = models.WBSFile(
        wbs_id=wbs_id,
        project_id=wbs.project_id,
        filename=os.path.basename(target_path),
        filepath=target_path,
        filesize=filesize,
        uploaded_by=uploaded_by,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize(record, {})


@router.get("/wbs/{wbs_id}/files")
def list_wbs_files(wbs_id: int, db: Session = Depends(get_db)):
    files = (
        db.query(models.WBSFile)
        .filter(models.WBSFile.wbs_id == wbs_id)
        .order_by(models.WBSFile.created_at.desc())
        .all()
    )
    user_ids = {f.uploaded_by for f in files if f.uploaded_by}
    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name
    return [_serialize(f, user_map) for f in files]


@router.get("/wbs/files/{file_id}/download")
def download_wbs_file(file_id: int, db: Session = Depends(get_db)):
    record = db.query(models.WBSFile).filter(models.WBSFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    if not record.filepath or not os.path.exists(record.filepath):
        raise HTTPException(status_code=410, detail="저장된 파일이 사라졌어요.")
    return FileResponse(record.filepath, filename=record.filename)


@router.delete("/wbs/files/{file_id}")
def delete_wbs_file(file_id: int, db: Session = Depends(get_db)):
    record = db.query(models.WBSFile).filter(models.WBSFile.id == file_id).first()
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
