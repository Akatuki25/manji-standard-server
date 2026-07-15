"""結合テスト用 fixture。Postgres が到達不能なら suite をスキップ。
起動: `docker compose up -d` → `uv run --with ... pytest -m integration`。
"""
from __future__ import annotations
import pytest
from sqlalchemy import text

from app.infra.db import _engine
from app.domain.entity.base import Base
from app.domain.entity.registry import ALL


def _reachable() -> bool:
    try:
        with _engine.connect() as c:
            c.execute(text("select 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session", autouse=True)
def _schema():
    if not _reachable():
        pytest.skip("Postgres 未起動(docker compose up -d)。結合テストをスキップ")
    Base.metadata.create_all(_engine)   # dev の AutoMigrate 相当
    yield
    Base.metadata.drop_all(_engine)


@pytest.fixture(autouse=True)
def _clean():
    yield
    with _engine.begin() as c:
        for ent in ALL:
            c.execute(text(f'DELETE FROM "{ent.__tablename__}"'))
