"""User ドメインサービス(手書き)。ビジネスロジック + Entity 構築。
repository を呼び entity を返す。DTO 変換は usecase の責務(ここではやらない)。
manji Go の internal/domain/service/user_service.go 相当。
"""
from __future__ import annotations
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from app.domain.entity.user import User
from app.domain.repository.user_repository import (
    UserRepository,
    UserNotFoundError,
    UserAlreadyExistsError,
)


def _unix_or_now(sec: int, clock: Callable[[], datetime]) -> datetime:
    return clock() if not sec else datetime.fromtimestamp(sec, tz=timezone.utc)


class UserService:
    def __init__(self, repo: UserRepository, clock: Callable[[], datetime] | None = None) -> None:
        self._repo = repo
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def create(self, email: str, name: str) -> User:
        if self._repo.select_by_email(email) is not None:  # app-level dedup pre-check
            raise UserAlreadyExistsError()
        user = User.new(uuid.uuid4().hex, email, name, self._clock())  # 検証は new() 内
        self._repo.insert(user)
        return user

    def bulk_create(self, items) -> list[User]:
        # 事前 dedup はせず DB 制約に委ねる(manji と同じ)。items は .email/.name を持つ
        users = [User.new(uuid.uuid4().hex, i.email, i.name, self._clock()) for i in items]
        self._repo.bulk_insert(users)
        return users

    def bulk_upsert(self, items) -> list[User]:
        users = [
            User.new(i.id, i.email, i.name, _unix_or_now(i.created_at_unix, self._clock))
            for i in items
        ]
        self._repo.bulk_upsert(users)
        return users

    def get(self, id: str) -> User | None:
        return self._repo.select_by_pk(id)

    def get_by_email(self, email: str) -> User | None:
        return self._repo.select_by_email(email)

    def list(self) -> list[User]:
        return self._repo.select_all()

    def list_by_cursor(self, limit: int, after: str | None) -> list[User]:
        return self._repo.select_by_cursor(limit, after)

    def update(self, id: str, email: str, name: str) -> User:
        cur = self._repo.select_by_pk(id)
        if cur is None:
            raise UserNotFoundError()
        updated = User.new(id, email, name, cur.created_at)  # created_at を保持
        self._repo.update(updated)
        return updated

    def upsert(self, id: str, email: str, name: str, created_at_unix: int) -> User:
        user = User.new(id, email, name, _unix_or_now(created_at_unix, self._clock))
        self._repo.upsert(user)
        return user

    def delete(self, id: str) -> None:
        self._repo.delete(id)

    def bulk_delete(self, ids: list[str]) -> None:
        self._repo.bulk_delete(ids)

    def delete_all(self) -> None:
        self._repo.delete_all()
