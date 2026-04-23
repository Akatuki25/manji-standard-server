SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help install dev build start test lint clean proto-gen proto-clean docker-build docker-up docker-down

help: ## ターゲット一覧
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-14s\033[0m %s\n", $$1, $$2}'

install: ## 依存をインストール
	npm install

dev: ## 開発起動（Next.js :3000）
	npm run dev

build: ## Next.js ビルド
	npm run build

start: ## ビルド後の起動
	npm start

test: ## Vitest 実行
	npm test

lint: ## 型チェック
	npm run lint

proto-gen: ## proto から Entity / Repository / Mock / Postgres 実装を生成
	npm run proto:gen

proto-clean: ## 生成物を削除
	npm run proto:clean

clean: ## ビルド成果物削除
	rm -rf .next node_modules

docker-build: ## Docker イメージビルド
	docker build -t manji-standard-server-ts-next:latest .

docker-up: ## docker-compose up
	docker compose up --build

docker-down: ## docker-compose down
	docker compose down -v
