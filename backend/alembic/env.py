import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool

from alembic import context

# backend 디렉터리를 sys.path에 추가해 database / models를 import 가능하게 함
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base  # noqa: E402
import models  # noqa: F401, E402  — Base.metadata를 채우려면 모델 모듈 import 필요

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 모델 기반 autogenerate 대상 메타데이터
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite ALTER 제약 우회
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # database.py의 기존 engine을 재사용 (alembic.ini의 URL과 동일한 DB를 가리킴)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite ALTER 제약 우회
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
