SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help install dev build start test lint clean docker-build docker-up docker-down \
        proto-gen proto-clean

help: ## ターゲット一覧
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-14s\033[0m %s\n", $$1, $$2}'

install: ## 依存をインストール
	npm install

dev: ## 開発起動（tsx watch）
	npm run dev

build: ## TypeScript をビルド
	npm run build

start: ## dist を起動
	npm start

test: ## Vitest 実行
	npm test

lint: ## 型チェック
	npm run lint

proto-gen: ## proto から TypeScript コードを生成（src/gen/）
	npm run proto:gen

proto-clean: ## 生成コードを削除
	npm run proto:clean

clean: ## ビルド成果物削除
	rm -rf dist node_modules src/gen

docker-build: ## Docker イメージビルド
	docker build -t manji-standard-server-ts-hono:latest .

docker-up: ## docker-compose up
	docker compose up --build

docker-down: ## docker-compose down
	docker compose down -v
