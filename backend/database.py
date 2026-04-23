from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./pms.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# SQLite는 기본적으로 FK 제약을 무시하므로 연결마다 PRAGMA foreign_keys=ON 적용
@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()