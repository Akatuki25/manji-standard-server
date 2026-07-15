"""User usecase の単体テスト(生成 Mock 使用、実DB不要)。
manji の意図するテスト戦略(mock 注入 + 固定 clock)を Python で実装。
"""
from __future__ import annotations
from datetime import datetime, timezone

import pytest

from app.domain.entity.user import User
from app.domain.repository.mock.mock_user_repository import MockUserRepository
from app.domain.repository.user_repository import UserAlreadyExistsError, UserNotFoundError
from app.domain.service.user_service import UserService
from app.usecase.user_usecase import UserUsecase
from app.usecase.user_usecase_interface import (
    CreateUserInput,
    BulkCreateUsersInput,
    CreateUserParams,
    GetUserInput,
    ListUsersInput,
    UpdateUserInput,
    DeleteUserInput,
)

FIXED = datetime(2026, 7, 15, tzinfo=timezone.utc)


def _uc(repo: MockUserRepository) -> UserUsecase:
    return UserUsecase(UserService(repo, clock=lambda: FIXED))


def test_create_user_returns_dto_with_unix_timestamp():
    repo = MockUserRepository()
    inserted: list[User] = []
    repo.select_by_email_func = lambda email: None
    repo.insert_func = lambda e: inserted.append(e)

    dto = _uc(repo).create_user(CreateUserInput(email="a@b.com", name="Alice"))

    assert dto is not None
    assert dto.email == "a@b.com"
    assert dto.name == "Alice"
    assert dto.created_at_unix == int(FIXED.timestamp())  # entity datetime → DTO unix
    assert len(inserted) == 1 and inserted[0].id            # uuid が採番される


def test_create_user_duplicate_email_raises():
    repo = MockUserRepository()
    repo.select_by_email_func = lambda email: User(
        id="x", email=email, name="n", created_at=FIXED
    )
    with pytest.raises(UserAlreadyExistsError):
        _uc(repo).create_user(CreateUserInput(email="a@b.com", name="Alice"))


def test_create_user_invalid_email_raises_valueerror():
    repo = MockUserRepository()
    repo.select_by_email_func = lambda email: None
    with pytest.raises(ValueError):
        _uc(repo).create_user(CreateUserInput(email="not-an-email", name="Alice"))


def test_get_user_not_found_returns_none():
    repo = MockUserRepository()
    repo.select_by_pk_func = lambda id: None
    assert _uc(repo).get_user(GetUserInput(id="nope")) is None


def test_get_user_returns_dto():
    repo = MockUserRepository()
    repo.select_by_pk_func = lambda id: User(id=id, email="a@b.com", name="Alice", created_at=FIXED)
    dto = _uc(repo).get_user(GetUserInput(id="u1"))
    assert dto is not None and dto.id == "u1" and dto.email == "a@b.com"


def test_list_users_returns_dtos():
    repo = MockUserRepository()
    repo.select_all_func = lambda: [
        User(id="1", email="a@b.com", name="A", created_at=FIXED),
        User(id="2", email="c@d.com", name="B", created_at=FIXED),
    ]
    out = _uc(repo).list_users(ListUsersInput())
    assert [d.id for d in out] == ["1", "2"]


def test_update_user_missing_raises_notfound():
    repo = MockUserRepository()
    repo.select_by_pk_func = lambda id: None
    with pytest.raises(UserNotFoundError):
        _uc(repo).update_user(UpdateUserInput(id="x", email="a@b.com", name="N"))


def test_bulk_create_users_returns_dtos():
    repo = MockUserRepository()
    inserted: list[User] = []
    repo.bulk_insert_func = lambda es: inserted.extend(es)
    out = _uc(repo).bulk_create_users(
        BulkCreateUsersInput(
            users=[
                CreateUserParams(email="a@b.com", name="A"),
                CreateUserParams(email="c@d.com", name="B"),
            ]
        )
    )
    assert [d.email for d in out] == ["a@b.com", "c@d.com"]
    assert len(inserted) == 2 and all(u.id for u in inserted)


def test_delete_user_delegates_to_repo():
    repo = MockUserRepository()
    deleted: list[str] = []
    repo.delete_func = lambda id: deleted.append(id)
    assert _uc(repo).delete_user(DeleteUserInput(id="u1")) is None
    assert deleted == ["u1"]
