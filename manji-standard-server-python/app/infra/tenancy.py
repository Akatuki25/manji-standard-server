"""マルチテナントの principal 伝播(手書き infra seam)。

`@owned` entity は生成 repo が `current_owner()` を呼び、全クエリを所有者で絞る。
その所有者(principal)を「どう決めるか」は横断関心なのでここに閉じ込める:

- HTTP: 生成された handler の owned router が `Depends(require_owner)` を持ち、
  リクエスト文脈(=endpoint と同じ task)で contextvar をセットする。
  → BaseHTTPMiddleware の dispatch で contextvar を張ると endpoint に伝播しない罠を回避。
- 非HTTP(MCP/CLI/バッチ): `with owner_scope(email): ...` で明示的に張る。

principal の“出所”は auth 実装依存なので、規約として **middleware が
`request.state.principal_email` を入れておく**ことにし、ここはそれを読むだけにする
(auth の詳細=JWT検証などを tenancy に持ち込まない)。未設定なら DEV_OWNER_EMAIL。
"""
from __future__ import annotations

import contextvars
import os
from contextlib import contextmanager
from collections.abc import Iterator

# ローカル/認証オフ時の既定所有者。全行がこの owner になる(単一テナント相当)。
DEV_OWNER = os.environ.get("DEV_OWNER_EMAIL", "local@dev")

_owner: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "mss_current_owner", default=None
)


def current_owner() -> str:
    """今の principal を返す。未設定なら fail-closed(=誤って全テナントを触らせない)。"""
    v = _owner.get()
    if not v:
        raise RuntimeError(
            "current_owner() called without a principal. "
            "HTTP は owned router の Depends(require_owner)、"
            "非HTTP は owner_scope(email) で設定すること。"
        )
    return v


def set_current_owner(email: str) -> contextvars.Token:
    return _owner.set(email)


@contextmanager
def owner_scope(email: str) -> Iterator[None]:
    """非HTTP経路(MCP等)で principal を張る。"""
    token = _owner.set(email or DEV_OWNER)
    try:
        yield
    finally:
        _owner.reset(token)


def require_owner(request) -> str:  # FastAPI が Request を注入(型注釈は循環回避のため省略)
    """owned router の依存。principal を解決し contextvar に載せて返す。

    規約: 認証 middleware が `request.state.principal_email` を入れておく。
    未認証(AUTH_MODE=off 等)は DEV_OWNER にフォールバックしローカル開発を壊さない。
    """
    email = getattr(request.state, "principal_email", None) or DEV_OWNER
    _owner.set(email)
    return email
