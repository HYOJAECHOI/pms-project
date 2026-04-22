from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
db.execute(text("UPDATE users SET role='manager' WHERE role IN ('pm','director','executive')"))
db.execute(text("UPDATE users SET role='user' WHERE role='member'"))
db.commit()
print('완료')
db.close()
