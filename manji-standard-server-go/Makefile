SHELL := /bin/bash

BUF_VERSION            := v1.45.0
PROTOC_GEN_GO_VERSION  := v1.34.2
CONNECT_GO_VERSION     := v1.17.0

.DEFAULT_GOAL := help
.PHONY: help build run test lint fmt tidy docker-build docker-up docker-down clean \
        install-tools proto-gen proto-clean

help: ## ターゲット一覧
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-14s\033[0m %s\n", $$1, $$2}'

build: ## バイナリをビルド
	go build -o bin/api ./cmd/api

run: ## API サーバーをローカル起動
	go run ./cmd/api

test: ## テスト実行
	go test ./...

lint: ## Lint（go vet）
	go vet ./...

fmt: ## フォーマット
	gofmt -w .

tidy: ## go.sum 整理
	go mod tidy

install-tools: ## buf + protoc プラグインをインストール（カスタム mss-protoc-gen も含む）
	go install github.com/bufbuild/buf/cmd/buf@$(BUF_VERSION)
	go install google.golang.org/protobuf/cmd/protoc-gen-go@$(PROTOC_GEN_GO_VERSION)
	go install connectrpc.com/connect/cmd/protoc-gen-connect-go@$(CONNECT_GO_VERSION)
	go install ./cmd/mss-protoc-gen

proto-gen: ## proto から Go コードを生成（gen/ 配下）
	PATH="$$(go env GOPATH)/bin:$$PATH" buf generate

proto-clean: ## 生成コードを削除
	rm -rf gen/

docker-build: ## Docker イメージビルド
	docker build -t manji-standard-server-go:latest .

docker-up: ## docker-compose up
	docker compose up --build

docker-down: ## docker-compose down
	docker compose down -v

clean: ## ビルド成果物削除
	rm -rf bin/
