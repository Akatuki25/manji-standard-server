"""manji-standard-server-python — FastAPI エントリポイント(手書き wiring)。
組立順: repo → service → usecase → 生成 router 登録(manji Go の cmd/api/main.go 相当)。
"""
from __future__ import annotations
from fastapi import FastAPI

from app.di.handlers import register_routers
from app.domain.service.user_service import UserService
from app.infra.repository.user_postgres_repository import new_postgres_user_repository
from app.usecase.user_usecase import UserUsecase


def create_app() -> FastAPI:
    app = FastAPI(title="manji-standard-server-python")

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    user_repo = new_postgres_user_repository()
    user_service = UserService(user_repo)          # clock 未指定 → now
    user_usecase = UserUsecase(user_service)
    register_routers(app, user_usecase=user_usecase)
    return app


app = create_app()
