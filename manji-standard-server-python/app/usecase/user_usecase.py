"""User usecase 実装(手書き)。生成された UserServiceUsecase interface を満たす。
各メソッド: Input を展開 → service を呼ぶ → 境界で DTO に変換して返す。
manji Go の internal/usecase/user_usecase.go 相当。
**トランザクション境界は usecase が張る**(db.py の設計)。tx.run を忘れると
flush のみで commit されず、HTTP 経由の書き込みが永続化されない。
"""
from __future__ import annotations

from app.domain.service.user_service import UserService
from app.infra.db import tx
from app.dto.user import UserDTO, from_entities
from app.usecase.user_usecase_interface import (
    ListUsersInput,
    ListUsersByCursorInput,
    GetUserByEmailInput,
    GetUserInput,
    CreateUserInput,
    BulkCreateUsersInput,
    UpsertUserInput,
    BulkUpsertUsersInput,
    UpdateUserInput,
    BulkDeleteUsersInput,
    DeleteUserInput,
    DeleteAllUsersInput,
)


class UserUsecase:  # implements UserServiceUsecase (Protocol)
    def __init__(self, service: UserService) -> None:
        self._svc = service

    def list_users(self, inp: ListUsersInput) -> list[UserDTO]:
        return tx.run(lambda: from_entities(self._svc.list()))

    def list_users_by_cursor(self, inp: ListUsersByCursorInput) -> list[UserDTO]:
        return tx.run(lambda: from_entities(self._svc.list_by_cursor(inp.limit, inp.after_id)))

    def get_user_by_email(self, inp: GetUserByEmailInput) -> UserDTO | None:
        e = tx.run(lambda: self._svc.get_by_email(inp.email))
        return UserDTO.from_entity(e) if e else None

    def get_user(self, inp: GetUserInput) -> UserDTO | None:
        e = tx.run(lambda: self._svc.get(inp.id))
        return UserDTO.from_entity(e) if e else None

    def create_user(self, inp: CreateUserInput) -> UserDTO | None:
        return tx.run(lambda: UserDTO.from_entity(self._svc.create(inp.email, inp.name)))

    def bulk_create_users(self, inp: BulkCreateUsersInput) -> list[UserDTO]:
        return tx.run(lambda: from_entities(self._svc.bulk_create(inp.users)))

    def bulk_upsert_users(self, inp: BulkUpsertUsersInput) -> list[UserDTO]:
        return tx.run(lambda: from_entities(self._svc.bulk_upsert(inp.users)))

    def upsert_user(self, inp: UpsertUserInput) -> UserDTO | None:
        return tx.run(lambda: UserDTO.from_entity(
            self._svc.upsert(inp.id, inp.email, inp.name, inp.created_at_unix)
        ))

    def update_user(self, inp: UpdateUserInput) -> UserDTO | None:
        return tx.run(lambda: UserDTO.from_entity(self._svc.update(inp.id, inp.email, inp.name)))

    def bulk_delete_users(self, inp: BulkDeleteUsersInput) -> None:
        tx.run(lambda: self._svc.bulk_delete(inp.ids))

    def delete_user(self, inp: DeleteUserInput) -> None:
        tx.run(lambda: self._svc.delete(inp.id))

    def delete_all_users(self, inp: DeleteAllUsersInput) -> None:
        tx.run(lambda: self._svc.delete_all())
