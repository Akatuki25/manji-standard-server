"""DB / トランザクション境界(手書き infra)。

manji Go の `tx.Run(ctx, fn)` / `tx.From(ctx)` の Python 版。
- Usecase 層が `tx.run(fn)` でトランザクション境界を張る。
- Repository は `tx.session()` で「今の tx の session」を取り、境界を意識しない。
- tx 外で session() を呼んだら default セッションを使い警告(Go の slog.Warn 相当)。
SQLAlchemy 2.0。session は contextvar で伝播(Go の ctx 伝播に相当)。
"""
from __future__ import annotations
import contextvars
import logging
import os
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import TypeVar

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

log = logging.getLogger("mss.tx")
T = TypeVar("T")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://mss:mss@localhost:5432/mss"
)

_engine = create_engine(DATABASE_URL, future=True)
_Session = sessionmaker(bind=_engine, expire_on_commit=False, future=True)

# 現在のトランザクションの session(tx.run 内でのみ set される)
_current: contextvars.ContextVar[Session | None] = contextvars.ContextVar(
    "mss_tx_session", default=None
)


class Tx:
    """トランザクション境界。Usecase 層が保持し `run` で境界を張る。"""

    def run(self, fn: Callable[[], T]) -> T:
        """1トランザクションで fn を実行。例外で rollback、正常終了で commit。"""
        s = _Session()
        token = _current.set(s)
        try:
            result = fn()
            s.commit()
            return result
        except Exception:
            s.rollback()
            raise
        finally:
            _current.reset(token)
            s.close()

    def session(self) -> Session:
        """今の tx の session を返す。tx 外なら default を作り警告。"""
        s = _current.get()
        if s is None:
            log.warning("repository used outside a transaction (tx.run); using ad-hoc session")
            return _Session()
        return s


tx = Tx()


@contextmanager
def session_scope() -> Iterator[Session]:
    """tx を使わない読み取り等の簡易スコープ。"""
    s = _Session()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
