"""mss-migration-gen (Python port) — Entity から migration SQL を生成。

manji Go の cmd/mss-migration-gen 相当。SQLAlchemy モデル(registry.ALL)を introspect し、
中間スキーマ → `migrations/.snapshot.json` と差分 → 変更テーブルごとに `<ts>_<name>.up.sql` を出力。
方針(manji 準拠): PK-first 列順、DEFAULT/CASCADE を使わない、破壊的変更に `-- WARNING`、
down は手書き(生成しない)、snapshot はコミットして真実源にする。
使い方: python tools/mss-migration-gen/main.py [--dry-run] [-name NAME]
"""
from __future__ import annotations
import argparse, json, os, sys
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, Float, Integer, String

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)

from app.domain.entity.registry import ALL  # noqa: E402

SNAPSHOT = os.path.join(ROOT, "migrations", ".snapshot.json")
MIG_DIR = os.path.join(ROOT, "migrations")


def _pg_type(col) -> str:
    t = col.type
    if isinstance(t, String):
        return "text"
    if isinstance(t, BigInteger):
        return "bigint"
    if isinstance(t, Integer):
        return "integer"
    if isinstance(t, Boolean):
        return "boolean"
    if isinstance(t, Float):
        return "double precision"
    if isinstance(t, DateTime):
        return "timestamptz"
    return "text"


def _current_schema() -> dict:
    """SQLAlchemy モデル → {table: {columns: {col: {sql_type,not_null,primary_key,unique}}}}"""
    tables: dict = {}
    for ent in ALL:
        tbl = ent.__table__
        cols = {}
        for c in tbl.columns:
            cols[c.name] = {
                "sql_type": _pg_type(c),
                "not_null": (not c.nullable) or c.primary_key,
                "primary_key": bool(c.primary_key),
                "unique": bool(c.unique),
            }
        tables[tbl.name] = {"columns": cols}
    return {"tables": tables}


def _load_snapshot() -> dict:
    if os.path.exists(SNAPSHOT):
        with open(SNAPSHOT) as f:
            return json.load(f)
    return {"tables": {}}


def _order(cols: dict) -> list[str]:
    """PK-first、その後アルファベット順(manji sql.go 準拠)。"""
    pk = [n for n, c in cols.items() if c["primary_key"]]
    rest = sorted(n for n in cols if n not in pk)
    return pk + rest


def _col_def(name: str, c: dict) -> str:
    parts = [f'"{name}"', c["sql_type"]]
    if c["primary_key"]:
        parts.append("PRIMARY KEY")
    else:
        if c["not_null"]:
            parts.append("NOT NULL")
        if c["unique"]:
            parts.append("UNIQUE")
    return " ".join(parts)


def _create_sql(table: str, cols: dict) -> str:
    lines = [f"-- create table {table}", f'CREATE TABLE "{table}" (']
    defs = [f"  {_col_def(n, cols[n])}" for n in _order(cols)]
    lines.append(",\n".join(defs))
    lines.append(");")
    return "\n".join(lines) + "\n"


def _alter_sql(table: str, prev: dict, curr: dict) -> str | None:
    stmts: list[str] = []
    pc, cc = prev["columns"], curr["columns"]
    for n in _order(cc):
        if n not in pc:
            c = cc[n]
            if c["not_null"] and not c["primary_key"]:
                stmts.append(f'-- WARNING: adding NOT NULL column "{n}" fails if rows exist; split into 2 steps')
            stmts.append(f'ALTER TABLE "{table}" ADD COLUMN {_col_def(n, c)};')
    for n in pc:
        if n not in cc:
            stmts.append(f'-- WARNING: dropping column "{n}" is destructive')
            stmts.append(f'ALTER TABLE "{table}" DROP COLUMN "{n}";')
    for n in cc:
        if n in pc and cc[n] != pc[n]:
            if cc[n]["sql_type"] != pc[n]["sql_type"]:
                stmts.append(f'-- WARNING: type change on "{n}" ({pc[n]["sql_type"]} -> {cc[n]["sql_type"]})')
                stmts.append(f'ALTER TABLE "{table}" ALTER COLUMN "{n}" TYPE {cc[n]["sql_type"]};')
    if not stmts:
        return None
    return f"-- alter table {table}\n" + "\n".join(stmts) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("-name", default=None)
    args = ap.parse_args()

    curr = _current_schema()
    prev = _load_snapshot()
    changes: list[tuple[str, str]] = []  # (name, sql)

    for table, c in curr["tables"].items():
        if table not in prev["tables"]:
            changes.append((f"create_{table}", _create_sql(table, c["columns"])))
        else:
            sql = _alter_sql(table, prev["tables"][table], c)
            if sql:
                changes.append((f"alter_{table}", sql))
    for table in prev["tables"]:
        if table not in curr["tables"]:
            changes.append((f"drop_{table}", f'-- WARNING: dropping table {table} is destructive\nDROP TABLE "{table}";\n'))

    if not changes:
        print("no schema changes.")
        return

    if args.dry_run:
        for _, sql in changes:
            print(sql)
        return

    os.makedirs(MIG_DIR, exist_ok=True)
    base = datetime.now(timezone.utc)
    for i, (name, sql) in enumerate(changes):
        ts = base.replace(microsecond=0).strftime("%Y%m%d%H%M%S")
        ts = str(int(ts) + i)  # 複数変更を順序付け
        nm = args.name if (args.name and len(changes) == 1) else name
        path = os.path.join(MIG_DIR, f"{ts}_{nm}.up.sql")
        with open(path, "w") as f:
            f.write(sql)
        print("wrote:", os.path.relpath(path, ROOT))

    with open(SNAPSHOT, "w") as f:
        json.dump(curr, f, indent=2, sort_keys=True)
    print("updated:", os.path.relpath(SNAPSHOT, ROOT))


if __name__ == "__main__":
    main()
