"""実 Postgres 結合テスト(-m integration)。生成 infra(SQLAlchemy)を貫通で検証。
tx.run で各操作をトランザクション境界に包む。"""
from __future__ import annotations
import pytest

from app.infra.db import tx
from app.infra.repository.user_postgres_repository import new_postgres_user_repository
from app.domain.service.user_service import UserService
from app.usecase.user_usecase import UserUsecase
from app.domain.repository.user_repository import UserNotFoundError, UserAlreadyExistsError
from app.usecase.user_usecase_interface import (
    CreateUserInput,
    GetUserInput,
    ListUsersInput,
    UpdateUserInput,
    UpsertUserInput,
    DeleteUserInput,
)

pytestmark = pytest.mark.integration


def _uc() -> UserUsecase:
    return UserUsecase(UserService(new_postgres_user_repository()))


def test_create_get_list():
    uc = _uc()
    created = tx.run(lambda: uc.create_user(CreateUserInput(email="a@b.com", name="Alice")))
    got = tx.run(lambda: uc.get_user(GetUserInput(id=created.id)))
    assert got is not None and got.email == "a@b.com"
    rows = tx.run(lambda: uc.list_users(ListUsersInput()))
    assert len(rows) == 1


def test_create_duplicate_email_conflict():
    uc = _uc()
    tx.run(lambda: uc.create_user(CreateUserInput(email="d@b.com", name="A")))
    with pytest.raises(UserAlreadyExistsError):
        tx.run(lambda: uc.create_user(CreateUserInput(email="d@b.com", name="B")))


def test_update_missing_raises():
    uc = _uc()
    with pytest.raises(UserNotFoundError):
        tx.run(lambda: uc.update_user(UpdateUserInput(id="nope", email="a@b.com", name="X")))


def test_upsert_on_conflict_updates():
    uc = _uc()
    tx.run(lambda: uc.upsert_user(UpsertUserInput(id="u1", email="e@b.com", name="A", created_at_unix=0)))
    r = tx.run(lambda: uc.upsert_user(UpsertUserInput(id="u1", email="e@b.com", name="B", created_at_unix=0)))
    assert r is not None and r.name == "B"  # PG ON CONFLICT DO UPDATE


def test_delete():
    uc = _uc()
    c = tx.run(lambda: uc.create_user(CreateUserInput(email="x@b.com", name="X")))
    tx.run(lambda: uc.delete_user(DeleteUserInput(id=c.id)))
    assert tx.run(lambda: uc.get_user(GetUserInput(id=c.id))) is None
