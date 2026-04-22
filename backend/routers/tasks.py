from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from datetime import date
import models

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 태스크 생성
@router.post("/projects/{project_id}/tasks")
def create_task(project_id: int, title: str, description: str = "",
                assignee_id: int = None, status: str = "할일",
                due_date: date = None, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")
    task = models.Task(project_id=project_id, title=title, description=description,
                       assignee_id=assignee_id, status=status, due_date=due_date)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

# 태스크 목록 조회
@router.get("/projects/{project_id}/tasks")
def get_tasks(project_id: int, db: Session = Depends(get_db)):
    tasks = db.query(models.Task).filter(models.Task.project_id == project_id).all()
    return tasks

# 태스크 수정
@router.put("/tasks/{task_id}")
def update_task(task_id: int, title: str = None, description: str = None,
                assignee_id: int = None, status: str = None,
                due_date: date = None, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없어요.")
    if title: task.title = title
    if description: task.description = description
    if assignee_id: task.assignee_id = assignee_id
    if status: task.status = status
    if due_date: task.due_date = due_date
    db.commit()
    db.refresh(task)
    return task

# 태스크 삭제
@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없어요.")
    db.delete(task)
    db.commit()
    return {"message": "태스크가 삭제됐어요."}