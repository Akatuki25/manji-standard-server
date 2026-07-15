"""apply-migrations — mss-migration-gen が出力した migrations/*.up.sql を昇順に一度ずつ適用する。

適用済みファイル名は `_mss_migrations` テーブルに記録し、再実行しても冪等。
コンテナ起動時(compose の command)や手元での初期化に使う:
    uv run python tools/apply-migrations.py
"""
from __future__ import annotations
import glob
import os
import time

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://mss:mss@localhost:5432/mss"
)


def _statements(sql: str):
    """';' 区切りの素朴な分割。セグメント内の先頭コメント行(--)は落とす。"""
    for seg in sql.split(";"):
        lines = [ln for ln in seg.splitlines() if ln.strip() and not ln.strip().startswith("--")]
        if lines:
            yield "\n".join(lines)


def main() -> None:
    engine = create_engine(DATABASE_URL, future=True)

    # DB 起動待ち(compose の healthcheck 保険)
    for i in range(30):
        try:
            with engine.connect():
                break
        except Exception:
            if i == 29:
                raise
            time.sleep(1)

    with engine.begin() as c:
        c.execute(text(
            "CREATE TABLE IF NOT EXISTS _mss_migrations ("
            "name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        ))
        done = {r[0] for r in c.execute(text("SELECT name FROM _mss_migrations"))}

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for path in sorted(glob.glob(os.path.join(here, "migrations", "*.up.sql"))):
        name = os.path.basename(path)
        if name in done:
            continue
        with open(path) as f:
            sql = f.read()
        with engine.begin() as c:  # 1ファイル = 1トランザクション
            for stmt in _statements(sql):
                c.execute(text(stmt))
            c.execute(text("INSERT INTO _mss_migrations(name) VALUES (:n)"), {"n": name})
        print("applied:", name)
    print("migrations up to date")


if __name__ == "__main__":
    main()
