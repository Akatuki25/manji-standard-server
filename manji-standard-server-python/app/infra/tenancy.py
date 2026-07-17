"""マルチテナントの principal 伝播(手書き infra seam)。

`@owned` entity は生成 repo が `current_owner()` を呼び、全クエリを所有者で絞る。
その所有者(principal)を「どう決めるか」は横断関心なのでここに閉じ込める:

- HTTP: アプリ横断の **TenancyMiddleware(pure-ASGI)** が各リクエストを
  `owner_scope(principal)` で包む。**同一タスクで contextvar を張る**ので、
  FastAPI が sync endpoint を threadpool に投げても context がコピーされ伝播する。
  → BaseHTTPMiddleware.dispatch や Depends(=threadpool 別コンテキスト)で
    contextvar を張ると endpoint に届かない罠を、pure-ASGI で回避する。
- 非HTTP(MCP/CLI/バッチ): `with owner_scope(email): ...` で明示的に張る。

principal の“出所”は auth 実装依存なので、TenancyMiddleware には解決関数を注入する
(auth の詳細=JWT検証などを tenancy に持ち込まない)。未設定なら DEV_OWNER。
"""
from __future__ import annotations

import contextvars
import os
from contextlib import contextmanager
from collections.abc import Callable, Iterator

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


class TenancyMiddleware:
    """pure-ASGI: 各 HTTP リクエストを principal で owner_scope する横断 middleware。

    resolve(scope) が principal(email)を返す(未解決なら DEV_OWNER)。JWT 検証など
    auth 詳細は resolve 側(アプリ)に置き、ここは contextvar を張るだけ。
    pure-ASGI ゆえ endpoint(threadpool)まで contextvar が伝播する。
    """

    def __init__(self, app, resolve: Callable[[dict], str | None]) -> None:
        self._app = app
        self._resolve = resolve

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self._app(scope, receive, send)
            return
        try:
            owner = self._resolve(scope)
        except Exception:
            owner = None
        with owner_scope(owner or DEV_OWNER):
            await self._app(scope, receive, send)
